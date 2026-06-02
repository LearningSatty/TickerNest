# TickerNest — Step 1: System Design (v2 — manual-avg)

Supersedes v1. Key change: **`Holding` is the writable source of truth.**
Avg-cost is user-supplied, never derived. The `Trade` ledger is dropped from
MVP. `SoldShare` becomes its own writable ledger (matches your Excel sheet).

---

## 0. Glossary

| Term | Meaning |
|---|---|
| Holding | A row `(user, broker, ticker, qty, avg_cost)`. Writable. PK enforced. |
| SoldShare | Manual sell-event row written when the user reduces a holding. |
| Universe | Set of tickers we keep live quotes for, per user. |
| Provider | External adapter (Quote, FX, MF, Crypto, Gold). |
| MV | Postgres materialized view. |

Money is `NUMERIC(20,4)` everywhere.

---

## 1. C4 L1 — same as v1 (external actors unchanged).

## 2. C4 L2 — same shape; the only difference is `trade-module → holding-module`
and the addition of a `sold-share-module`.

---

## 3. ER Diagram (v2)

```
                      ┌──────┐
                      │ user │1
                      └──┬───┘
       ┌────────────┬───┼─────────────┬─────────────────┐
       │            │   │             │                 │
       ▼            ▼   ▼             ▼                 ▼
   ┌────────┐  ┌───────────┐  ┌────────────┐  ┌───────────────┐
   │broker  │* │watchlist  │* │ mutual_fund│* │ us_investment │*
   └───┬────┘  └────┬──────┘  └─────┬──────┘  └───────────────┘
       │1           │1              │1
       ▼*           ▼*              ▼*
   ┌────────────┐  ┌────────────┐  ┌────────────────────┐
   │ holding    │  │subsection  │  │mutual_fund_unit_evt│
   │ (qty,avg)  │  │            │  │                    │
   └────────────┘  └────┬───────┘  └────────────────────┘
       ▲                │1
       │1               ▼*
       │           ┌────────────────┐
       │           │watchlist_item  │
       │           └────────────────┘
       │
       │  derives (MV):
       │
       └─▶ v_holding_consolidated(user, ticker, total_qty, weighted_avg, per_broker JSONB)
            (Excel "Summary" pivot — only MV we still need)

   Independent ledgers:
   sold_share (user, broker, ticker, qty, sold_at, sold_price, cost_basis_at_sell, reason, mistake)
   dividend, gold, crypto, manual_asset, sip_plan, csv_import, excel_import,
   ticker_meta, personal_vault, note
```

Cardinalities — same as v1 minus `trade`. Notable:
- `(user_id, broker_id, ticker)` is the PK / UNIQUE on `holding` — gives us
  natural idempotency on every holding write.

---

## 4. Materialized views — only ONE survives

### `v_holding_consolidated` (the Excel "Summary" sheet)
```sql
SELECT
  h.user_id, h.ticker,
  SUM(h.qty)                                          AS total_qty,
  SUM(h.qty * h.avg_cost) / NULLIF(SUM(h.qty), 0)     AS weighted_avg_cost,
  SUM(h.qty * h.avg_cost)                             AS total_invested,
  jsonb_agg(jsonb_build_object(
    'broker_id',   h.broker_id,
    'broker_name', b.display_name,
    'qty',         h.qty,
    'avg_cost',    h.avg_cost
  ) ORDER BY b.sort_order)                            AS per_broker
FROM holding h
JOIN broker b ON b.id = h.broker_id
WHERE h.qty > 0
GROUP BY h.user_id, h.ticker;
```

`invested = qty × avg_cost` is direct (no fee accounting at MVP — user includes
brokerage in their avg_cost the same way Excel does).

Sector aggregation is now a plain SELECT against `holding × ticker_meta` —
no MV needed because there is no historical trade tail to fold over.

### Refresh policy
`REFRESH MATERIALIZED VIEW CONCURRENTLY v_holding_consolidated`
triggered by `AFTER INSERT OR UPDATE OR DELETE ON holding` → debounced 250 ms
Bull job per user.

---

## 5. Sequence diagrams

### 5.1 Manual holding edit (the new core write)

```
Client                NestJS API                                 Postgres
   │ PUT /holdings/:brokerId/:ticker
   │ body: { qty: '12', avgCost: '720.00' }
   │ Idempotency-Key: <uuid>
   ├──────────────▶│
   │               │ idempotency lookup (24h table)
   │               │ TX BEGIN
   │               │   UPSERT INTO holding (user, broker, ticker, qty, avg_cost,
   │               │                        updated_at)
   │               │     VALUES (...)
   │               │     ON CONFLICT (user, broker, ticker)
   │               │     DO UPDATE SET qty=EXCLUDED.qty, avg_cost=EXCLUDED.avg_cost,
   │               │                   updated_at=NOW()
   │               │     RETURNING old_qty, old_avg_cost, new_qty, new_avg_cost
   │               │   IF new_qty < old_qty:
   │               │     INSERT INTO sold_share (qty=old_qty - new_qty,
   │               │                             cost_basis_at_sell=old_avg_cost,
   │               │                             sold_at=NOW(), ...)
   │               │   IF new_qty = 0:
   │               │     DELETE FROM holding (or keep with qty=0; we delete)
   │               │   record idempotency_record(user, key, holding_pk)
   │               ├──────────────────────────────────────────────────▶│
   │               │ TX COMMIT
   │               │ NOTIFY portfolio_changed:{userId} { ticker, brokerId }
   │               │ enqueue mv:refresh:consolidated:{userId} (debounced 250ms)
   │ ◀─────────────┤ 200 { holding, soldShareId? }
```

Three properties this guarantees:
1. **Idempotent retries** — natural key + Idempotency-Key dedupe table.
2. **Decreasing qty automatically writes a SoldShare row** with the avg_cost
   *snapshotted at the moment of sell* — so changing avg later doesn't
   rewrite history.
3. **Atomic** — holding update + sold-share insert in a single TX.

### 5.2 CSV / Excel import — same diff classifier, simpler commit

```
Client                NestJS API                Storage          Postgres
   │ POST /imports/:brokerId/preview {file}
   ├──────────────▶│
   │               │ INSERT csv_import (status=PARSING, file_hash)
   │               │ parse + zod
   │               │ stage rows
   │               │ DIFF vs holding(brokerId)
   │               │   classify → ADD | UPDATE | UNCHANGED | REMOVE
   │               │ status=PREVIEW
   │ ◀─────────────┤ 200 { adds, updates, removes, unchanged }
   │
   │ POST /imports/:importId/commit { mode: REPLACE | MERGE }
   ├──────────────▶│
   │               │ TX BEGIN
   │               │   for each diff row:
   │               │     ADD/UPDATE → UPSERT INTO holding (qty, avg_cost)
   │               │     REMOVE     → IF current.qty > 0:
   │               │                    INSERT INTO sold_share (qty, cost_basis,
   │               │                                            sold_at=NOW())
   │               │                  DELETE FROM holding
   │               │   csv_import.status=COMMITTED
   │               │ TX COMMIT
   │               │ NOTIFY portfolio_changed:{userId}
   │ ◀─────────────┤ 200 { rowsApplied, soldSharesCreated }
```

Excel onboarding fans this out one-per-broker-sheet inside a single
parent `excel_import` TX (same as v1).

### 5.3 Quote tick fan-out — unchanged from v1.

### 5.4 Daily ticker_meta enrichment — unchanged from v1.

---

## 6. End-to-end SELL example (v2)

User edits HDFC in Groww from `(qty=10, avg=700)` to `(qty=7, avg=700)`:

1. `PUT /holdings/groww/HDFCBANK { qty: '7', avgCost: '700' }` with idempotency-key.
2. API: idempotency lookup → NEW.
3. TX:
   - UPSERT → row was `(10, 700)`, becomes `(7, 700)`. RETURNING old_qty=10, new_qty=7.
   - new_qty < old_qty → INSERT `sold_share`:
     - qty = 10 − 7 = 3
     - cost_basis_at_sell = 700 (the *old* avg, snapshotted)
     - sold_at = NOW()
     - sold_price = NULL initially; user fills it in on the Sold-Shares page
     - reason / mistake = NULL initially
4. NOTIFY → MV refresh debounced → WS push → web + Android refetch.
5. `/sold` page now shows the new row; user can edit `sold_price`, `reason`,
   `mistake` later. `cost_basis_at_sell` is **immutable** by the API
   (only the user's note fields are editable).

If user instead set `(qty=15, avg=712)` (added 5 @ ~750), the same UPSERT
fires; `new_qty > old_qty` → no SoldShare row, just a holding update.

---

## 7. Realtime, Capacity, Failure modes — unchanged from v1.

Removing the trade ledger actually *reduces* write amplification on every
edit (one UPSERT instead of one INSERT + one MV refresh + one universe
rebuild). 10k DAU math gets a little easier; the cliff is still WS fan-out
and Yahoo informal limits.

---

## 8. Open questions resolved by this revision

| v1 question | v2 answer |
|---|---|
| Avg-cost policy on partial SELL | Moot — user-supplied. |
| FIFO vs weighted-avg | Moot. |
| `cost_basis_at_sell` snapshot on SELL | **Yes** — written at sell time from old avg, never recomputed. |
| Trade soft-delete with audit | Replaced by `holding_audit` event log (every UPSERT writes a row with old/new). Simpler, append-only, also gives us the basis for "undo last edit". |
| Excel onboarding for index sheets | Confirmed: ignore qty columns inside `NIFTY50` etc. — they're denormalised duplicates of broker data. |

Still pending your call:
- Do we keep `holding` rows at `qty=0` (history) or DELETE them? My default: **DELETE**, because SoldShare already records the historical position. Confirm.
- Dividend ledger — auto-derive expected from `ticker_meta.calendarEvents` (user reconciles), or strict user-entered? My default: **auto-derive expected**.
- Personal vault — Supabase Vault for secrets, column-level AES for PII? My default: **yes both**.

---

## 9. What Step 2 will deliver (revised, smaller)

- Postgres DDL for ~16 tables (was ~22).
- RLS policies on every table.
- One materialized view (`v_holding_consolidated`) and its refresh trigger.
- `holding_audit` append-only log table for the "what changed" trail.
- Seam interfaces unchanged from v1: `QuoteProvider`, `MutualFundProvider`,
  `FxProvider`, `CryptoProvider`, `GoldProvider`, `CsvParser`, `ExcelParser`,
  `BrokerCsvProfile`.
- Trade module is deleted from the codebase.
