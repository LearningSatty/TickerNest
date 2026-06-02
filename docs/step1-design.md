# TickerNest — Step 1: System Design

Status: Draft for review. Stop here for sign-off before Step 2 (DDL).

---

## 0. Glossary & Notation

| Term | Meaning |
|---|---|
| Trade | A single buy/sell/bonus/split/merge event. Source of truth. |
| Holding | Derived position per (user, broker, ticker). |
| Universe | Set of tickers TickerNest must keep quotes warm for, per user. |
| Provider | External-world adapter (Quote, FX, MF, Crypto, Gold). |
| MV | Postgres materialized view. |
| RT-GW | Realtime gateway (Socket.IO inside the API process). |

Numeric type everywhere money is involved: `NUMERIC(20,4)`. No JS `number`.

---

## 1. C4 Level 1 — System Context

```
              ┌──────────────────────────────────────────┐
              │                  USER                    │
              │  (web browser, Android app)              │
              └──────────────────┬───────────────────────┘
                                 │  HTTPS / WSS
                                 ▼
              ┌──────────────────────────────────────────┐
              │             TickerNest                   │
              │  (web app + REST/WSS API + scheduler)    │
              └──┬─────────┬──────────┬──────────┬───────┘
                 │         │          │          │
                 ▼         ▼          ▼          ▼
        ┌────────────┐ ┌────────┐ ┌────────┐ ┌────────────┐
        │  Yahoo     │ │ mfapi  │ │  FX    │ │ CoinGecko  │
        │  Finance   │ │  .in   │ │  host  │ │            │
        └────────────┘ └────────┘ └────────┘ └────────────┘
                 ▲              ▲
                 │              │
        ┌────────┴──┐  ┌────────┴──────┐
        │ MCX/IBJA  │  │  Identity:    │
        │ (gold)    │  │  Supabase     │
        └───────────┘  │  Auth (OAuth) │
                       └───────────────┘
```

External actors and why:
- **Yahoo Finance** — primary equity quotes (Indian + US), historical, sector, PE, 52wk, market cap. Free via `yahoo-finance2` npm.
- **mfapi.in** — free Indian mutual-fund NAV.
- **exchangerate.host** — daily FX (USD↔INR for US Investing).
- **CoinGecko** — crypto spot.
- **MCX / IBJA** — physical-gold reference rates (scrape behind a circuit breaker; advisory until phase-2 paid feed).
- **Supabase Auth** — JWT issuer; we never store passwords.

---

## 2. C4 Level 2 — Container Diagram

```
                         ┌──────────────────────────────────────────────┐
                         │  TickerNest                                  │
                         │                                              │
   Browser  ──HTTPS──▶  │   Web App (React, Vercel)                    │
                         │      │  REST + WSS                          │
                         │      ▼                                      │
   Android  ──HTTPS──▶  │   API (NestJS, Fly.io ×2 regions, sticky WS)│
                         │      │                                      │
                         │      ├──◀──────── PG LISTEN/NOTIFY          │
                         │      │                                      │
                         │      ▼                                      │
                         │   Scheduler (in-process Bull queues +       │
                         │   cron):                                    │
                         │     • quote-poller (5s mkt / 60s off)       │
                         │     • fx-poller   (1×/day)                  │
                         │     • mf-poller   (1×/day @ 23:00 IST)      │
                         │     • ticker-meta refresher (1×/day 03 IST) │
                         │     • dividend-calendar sync (1×/day)       │
                         │     • mv-refresher (debounced after writes) │
                         │                                              │
                         │   Realtime GW (Socket.IO, in API process)   │
                         │                                              │
                         │   Storage / Data:                            │
                         │     Postgres (Supabase)                     │
                         │     Redis    (Upstash)                      │
                         │     Object   (Supabase Storage: csv/xlsx)   │
                         │     Vault    (Supabase Vault for PII KMS)   │
                         └──────────────────────────────────────────────┘
                                            │
                                  ┌─────────┴────────┐
                                  ▼                  ▼
                          External providers   Identity (Supabase Auth)
```

Why everything in one Nest process for MVP:
- 10k DAU with the load model below stays well under one shared-cpu-1x; no microservice tax until we need it.
- Scheduler lives in the same process and shares the Postgres pool.
- WS fan-out happens in-process (no Redis pub/sub hop) — but we keep the Redis adapter wired so when we scale to 2+ instances Socket.IO can fan out cross-instance.

---

## 3. ER Diagram (logical)

```
                     ┌──────┐
                     │ user │1
                     └──┬───┘
       ┌────────────┬───┼─────────────┬─────────────────┬─────────┐
       │            │   │             │                 │         │
       ▼            ▼   ▼             ▼                 ▼         ▼
   ┌────────┐  ┌───────────┐  ┌────────────┐  ┌───────────────┐  ┌──────────┐
   │broker  │* │watchlist  │* │ mutual_fund│* │ us_investment │* │ note     │*
   └───┬────┘  └────┬──────┘  └─────┬──────┘  └───────────────┘  └──────────┘
       │            │               │
       │1           │1              │1
       ▼*           ▼*              ▼*
   ┌────────┐  ┌────────────┐  ┌────────────────────┐
   │trade   │  │subsection  │  │mutual_fund_unit_evt│
   └───┬────┘  └────┬───────┘  └────────────────────┘
       │            │1
       │            ▼*
       │       ┌────────────────┐
       │       │watchlist_item  │
       │       └────────────────┘
       │
       │  derives (MVs):
       │
       ├─▶ v_holding (user, broker, ticker, qty, avg_cost, invested)
       ├─▶ v_holding_consolidated (user, ticker, total_qty, wavg, per_broker JSONB)
       ├─▶ v_realized_pnl (user, broker, ticker, qty_sold, gross, net)
       ├─▶ v_sector_aggregate (user, broker, sector, current, prev)
       └─▶ v_distribution_buckets (user, broker, bucket, count, value)

   Reference / enrichment:
   ┌────────────┐
   │ticker_meta │   shared across users; refreshed daily.
   └────────────┘

   Independent ledgers (each ties back to user):
   dividend, gold, crypto, manual_asset, sip_plan, personal_vault, csv_import.
```

Key cardinalities:
- `user 1—* broker`: typically 1–15.
- `broker 1—* trade`: typically 50–5,000.
- `user 1—* watchlist`: unbounded; ~10–30 typical.
- `subsection 1—* watchlist_item`: a few hundred max.
- `ticker_meta` rows: ~6,000 unique (NSE + BSE + US covered).

Trade is the spine. Everything monetary except MF/US/gold/crypto/manual flows through it.

---

## 4. Materialized Views (the four that matter)

### 4.1 `v_holding`  (per user × broker × ticker)
Derives current position from trade ledger.

```sql
SELECT
  user_id, broker_id, ticker,
  SUM(CASE WHEN side = 'BUY'    THEN qty
           WHEN side = 'SELL'   THEN -qty
           WHEN side = 'BONUS'  THEN qty
           WHEN side = 'SPLIT'  THEN qty           -- split adjustment recorded as delta
           WHEN side = 'MERGE'  THEN qty
      END)                                              AS qty,
  -- weighted avg cost ignores SELL legs:
  CASE WHEN SUM(CASE WHEN side = 'BUY' THEN qty ELSE 0 END) = 0 THEN 0
       ELSE
         SUM(CASE WHEN side = 'BUY' THEN qty * price ELSE 0 END)
       / SUM(CASE WHEN side = 'BUY' THEN qty ELSE 0 END)
  END                                                   AS avg_cost,
  SUM(CASE WHEN side = 'BUY' THEN qty * price + fees ELSE 0 END)
                                                        AS invested,
  MAX(traded_at)                                        AS last_trade_at
FROM trade
GROUP BY user_id, broker_id, ticker;
```

**Caveat:** weighted-avg cost on partial SELL is a policy decision. Two valid choices:
1. **Avg ignores SELLs** (above) — matches what most Indian brokers show.
2. **Avg recomputes on SELL using FIFO** — needed for STCG/LTCG tax. Out of scope for MVP; we keep raw trades and derive FIFO P/L at tax time.

I went with (1) for MVP. Push back if you'd rather model FIFO from day 1.

### 4.2 `v_holding_consolidated` (the Excel "Summary" sheet)
```sql
SELECT
  h.user_id, h.ticker,
  SUM(h.qty)                                              AS total_qty,
  SUM(h.qty * h.avg_cost) / NULLIF(SUM(h.qty),0)          AS weighted_avg_cost,
  SUM(h.invested)                                         AS total_invested,
  jsonb_agg(jsonb_build_object(
    'broker_id',   h.broker_id,
    'broker_name', b.display_name,
    'qty',         h.qty,
    'avg_cost',    h.avg_cost,
    'invested',    h.invested
  ) ORDER BY b.sort_order)                                AS per_broker
FROM v_holding h
JOIN broker b ON b.id = h.broker_id
WHERE h.qty > 0
GROUP BY h.user_id, h.ticker;
```

The frontend renders the dynamic per-broker pair-of-columns directly from the JSONB — column count tracks the user's broker list.

### 4.3 `v_realized_pnl` (drives Sold Shares journal)
```sql
SELECT
  user_id, broker_id, ticker,
  SUM(CASE WHEN side = 'SELL' THEN qty END)               AS qty_sold,
  SUM(CASE WHEN side = 'SELL' THEN qty * price END)       AS gross_proceeds,
  SUM(CASE WHEN side = 'SELL' THEN qty * price - fees END) AS net_proceeds,
  MIN(CASE WHEN side = 'SELL' THEN traded_at END)         AS first_sold_at,
  MAX(CASE WHEN side = 'SELL' THEN traded_at END)         AS last_sold_at
FROM trade
WHERE side = 'SELL'
GROUP BY user_id, broker_id, ticker;
```
P/L vs cost is computed on read by joining to `v_holding`'s avg_cost at sell time (we snapshot avg_cost into `trade.cost_basis_at_sell` to make this immutable — a small denormalisation worth the simplicity).

### 4.4 `v_sector_aggregate` (drives broker-page sector strip)
```sql
SELECT
  h.user_id, h.broker_id,
  COALESCE(tm.sector, 'UNKNOWN')                          AS sector,
  SUM(h.qty * tm.current_price)                           AS current_value,
  SUM(h.qty * tm.prev_close)                              AS prev_value,
  SUM(h.qty * (tm.current_price - tm.prev_close))         AS day_change_value
FROM v_holding h
JOIN ticker_meta tm USING (ticker)
WHERE h.qty > 0
GROUP BY h.user_id, h.broker_id, tm.sector;
```

### Refresh policy
All four MVs are `REFRESH MATERIALIZED VIEW CONCURRENTLY` triggered by:
- `AFTER INSERT OR UPDATE OR DELETE ON trade` → enqueue Bull job `mv:refresh:holdings:{userId}` (debounced 250 ms).
- Quote tick: `v_sector_aggregate` is *not* refreshed on tick; the sector strip reads `v_holding.qty` × `ticker_meta.current_price` at query time so the latest tick is reflected without an MV rebuild.

This means: trade writes are slow (< 200 ms p99) but quote ticks are O(1) per ticker.

---

## 5. Sequence Diagrams

### 5.1 CSV / Excel import (single broker)

```
Client                NestJS API                    Storage         Postgres
   │ POST /imports
   │  multipart {file, brokerId, mode}
   ├────────▶│
   │         │ compute fileHash (SHA-256 of normalised content)
   │         │ INSERT csv_import (status=PARSING, fileHash)
   │         ├──────────────────────────────────────────▶│
   │         │ upload original to Storage
   │         ├──────────────────────────▶│              │
   │         │ parse → zod validate
   │         │ apply broker.csv_profile mapping
   │         │ stage rows in tmp_import_rows
   │         ├──────────────────────────────────────────▶│
   │         │ DIFF engine:
   │         │   for each ticker in staged rows:
   │         │     compare staged.qty/avgCost to v_holding.qty/avg_cost
   │         │     classify ADD | UPDATE | UNCHANGED
   │         │   for each holding-row not in staged (REPLACE mode only):
   │         │     classify REMOVE
   │         │ status=PREVIEW
   │         ├──────────────────────────────────────────▶│
   │ ◀───────┤ 200 { adds[], updates[], removes[], unchanged[] }
   │
   │ POST /imports/:id/commit { mode: REPLACE|MERGE }
   ├────────▶│
   │         │ TX BEGIN
   │         │   for each diff row → INSERT trade(side, qty, price, ...)
   │         │     side derivation:
   │         │       ADD     → BUY at staged.avgCost × staged.qty
   │         │       UPDATE  → BUY/SELL delta to reach staged.qty at staged.avgCost
   │         │       REMOVE  → SELL of full current qty at last_known_price
   │         │   debounced enqueue mv:refresh:holdings:{userId}
   │         │   csv_import.status=COMMITTED
   │         │ TX COMMIT
   │         │ NOTIFY universe_changed:{userId}
   │ ◀───────┤ 200 { tradesCreated, importId }
```

Three properties this sequence guarantees:
1. **Idempotent re-upload** of the same file is a no-op (`UNIQUE(user, broker, file_hash)`).
2. **Diff is reviewable** before any trade is written.
3. **Trade ledger remains the source of truth** — even an Excel import lands as trades.

Excel onboarding (your existing My-Portfolio.xlsx) is the same flow, but the API receives a workbook and fans out one CSV-import per broker sheet; the surrounding `excel_import` row groups them so a "rollback" reverts all 10 broker imports in one transaction.

### 5.2 Trade insert → holding refresh → fan-out

```
Client                NestJS API              Postgres            RT-GW           Other clients
   │ POST /trades
   │ {brokerId, ticker, side, qty, price, fees, tradedAt, idempotencyKey}
   ├────────▶│
   │         │ check (user,idemKey) dedupe table
   │         │ INSERT trade
   │         ├──────────────▶│
   │         │ trigger fires NOTIFY trade_changed:{userId}
   │         │
   │         │ enqueue mv:refresh:holdings:{userId} (debounced 250ms)
   │         │
   │ ◀───────┤ 201 { tradeId }
   │
   │                                  ◀── LISTEN trade_changed:{userId}
   │                                       (250ms later, debounced)
   │                                  ─── REFRESH MV CONCURRENTLY
   │                                       v_holding, v_holding_consolidated,
   │                                       v_realized_pnl
   │                                  ─── publish event:
   │                                       portfolio.changed:{userId}
   │                                                          ───▶│
   │                                                                  emit to room user:{userId}:
   │                                                                  {type: 'portfolio.changed',
   │                                                                   tickers: [...],
   │                                                                   brokerIds: [...]}
   │                                                                          ───▶│
   │ ◀────────────────────────────────────────────────────────────────────────────│ ws msg
   │ TanStack Query invalidates ['portfolio', userId]; refetch.
```

### 5.3 Quote tick fan-out (every 5s during market hours)

```
Scheduler             Quote Poller          Yahoo            Redis           RT-GW           Clients
   │ tick (5s)
   ├──────────▶│
   │           │ resolve universe(user) for all online users (LISTEN sessions)
   │           │ batch dedupe → unique tickers ≤ 50/req
   │           ├──────────────▶│
   │           │ ◀──────── quotes
   │           │ write quote cache (TTL=5s)
   │           ├─────────────────────▶│
   │           │ for each ticker with delta vs last_quote:
   │           │   identify subscribed users (universe membership index)
   │           │   publish quote.tick:{userId} { ticker, ltp, change, changePct }
   │           │                              ───────────────────▶│
   │           │                                                       emit to user:{userId}
   │           │                                                                            ───▶│
   │           │                                                                                ws msg
```

Universe membership index: a Redis Set per user `universe:{userId}` (rebuilt on `universe_changed`) and the inverse `subscribers:{ticker}` Set so a quote tick costs O(subscribers).

### 5.4 Daily ticker_meta enrichment (03:00 IST)

```
Scheduler           Enricher        Yahoo (quoteSummary)        Postgres
   │ cron 03:00 IST
   ├────────▶│
   │         │ pick all tickers in any user universe + 12mo recently sold
   │         ├──────────────────────▶│
   │         │ ◀── { sector, industry, peRatio, marketCap, 52wkH/L, listingDate, calendarEvents }
   │         │ UPSERT ticker_meta
   │         ├────────────────────────────────────▶│
   │         │ derive index_membership[] from sector + market cap rules
   │         │ UPSERT dividend events from calendarEvents
   │         │ NOTIFY ticker_meta_refreshed
```

---

## 6. SELL trade — end-to-end data flow

A walk-through because this is the most invariant-heavy path:

1. **User taps "Convert To-Sell row → SELL trade"** on watchlist `/watchlist/to-sell` for `INFY`, qty 5, price 1602, broker Groww.
2. Frontend sends `POST /trades` with `Idempotency-Key: <uuid>`.
3. API:
   a. Dedupe check: `SELECT 1 FROM trade WHERE user_id=$1 AND idempotency_key=$2`.
   b. **Cost basis snapshot**: read current `v_holding.avg_cost` for `(user, Groww, INFY)` and write into `trade.cost_basis_at_sell`. (This is what makes Sold Shares journal immutable even after later BUYs change the running avg.)
   c. INSERT trade (side=SELL, qty=5, price=1602, fees=…, traded_at=NOW(), cost_basis_at_sell=<snapshot>).
   d. Trigger fires `NOTIFY trade_changed:{userId}`.
4. **MV refresh job** (debounced 250 ms):
   - `v_holding(Groww, INFY).qty` decreases by 5; if it hits 0, row drops out (qty>0 filter).
   - `v_holding_consolidated.INFY.total_qty` decreases by 5; per_broker JSON re-aggregated.
   - `v_realized_pnl(Groww, INFY)` gains a new SELL leg.
5. **Universe check**: if `v_holding(Groww, INFY).qty=0` AND no watchlist contains INFY AND no recent-sold window includes INFY anymore, INFY is removed from `universe:{userId}` Redis set. Otherwise it stays warm.
6. **Realtime push** `portfolio.changed` with `{tickers: ['INFY'], brokerIds: [Groww]}` lands in web + Android. TanStack Query invalidates queries keyed on those, refetches.
7. **Sold Shares journal** (`/sold`) immediately surfaces the new row with:
   - Sold qty 5, sold at 1602, sold date now, broker Groww
   - Cost basis (frozen at sell time)
   - Loss/gain after selling = (1602 − cost_basis) × 5 − fees
   - Live-updating "Current Price now" + "52wk High price" pulled from `ticker_meta`
   - Empty `mistake_description` field for the user to journal later.

That single insert touches: Trade, 3 MVs, Redis universe, WS fan-out, Sold-Shares view. All derivations; only one writable row.

---

## 7. Realtime channel design (Socket.IO)

Rooms (one per user): `user:{userId}`.

Server → client message types:
| Type | Payload | When |
|---|---|---|
| `quote.tick` | `{ticker, ltp, change, changePct, t}` | every 5s if changed |
| `portfolio.changed` | `{tickers[], brokerIds[]}` | after MV refresh |
| `watchlist.changed` | `{watchlistId}` | after CRUD |
| `import.progress` | `{importId, status, rowsProcessed}` | during long imports |
| `dividend.received` | `{ticker, amount, depositDate}` | sync job finds new dividend |
| `meta.refreshed` | `{tickers[]}` | after daily enrichment |

Client → server: only auth handshake; everything else is REST (writes always go through HTTPS for retry/idempotency semantics).

Why not server-sent events (SSE):
- Android client handling of WS is more idiomatic.
- We may want client→server for "subscribe to symbol" later; cheaper to keep the door open.

---

## 8. Capacity math

### One-user model (you, today)
- ~1,000 unique tickers across all 10 brokers + watchlists.
- ~5,000 historical trades total (one-time backfill from Excel).
- Quote poll: 1k tickers / 50 per batch = **20 reqs every 5s = 4 req/s** to Yahoo. Comfortably within Yahoo's informal limits.
- Trade insert: rare — bursty during CSV import (~5k inserts), single TX, < 5s.
- MV refresh on full backfill: `v_holding` has at most ~1k rows → CONCURRENT refresh < 200 ms.

### 10k DAU model
Assumptions: avg user 5 brokers × 100 holdings + 200 watchlist tickers = ~700 tickers/user. 60% overlap with most-active 2k tickers → universe ~ **30k unique**.

| Metric | Math | Result |
|---|---|---|
| Yahoo batched req/s | 30k tickers / 50 per batch / 5s | **120 req/s** — needs request shaping or paid feed |
| WS messages/s peak | 30k tickers × ~0.5 changes/s × ~50 subscribers each | **750k msg/s** ⚠ |
| Postgres writes/s | trade ~0.1/user/min × 10k = ~17/s | trivial |
| Postgres reads/s | dashboard refresh ~0.05/user/s × 10k = 500/s | OK on free tier shared |
| Storage | 5 MB CSV × 5 imports/user × 10k = 250 GB | exceeds Supabase free 1 GB; needs lifecycle eviction |

**Implications at 10k DAU:**
1. Yahoo informal API will rate-limit us → swap to **Finnhub free tier (60 req/min)** or paid Polygon.io. The `QuoteProvider` seam absorbs this.
2. WS fan-out at 750k msg/s exceeds a single Fly shared-cpu instance (≈ 5–10k msg/s realistic). We'd need:
   - Throttle: send max 1 update/ticker/second per user (drop ticks).
   - Coalesce: bundle ticks into 250ms batches.
   - Horizontal scale: Socket.IO Redis adapter, 4–8 instances.
3. Storage: object lifecycle rule — keep last 5 imports per (user, broker), purge older.

For MVP we ship single-user with Yahoo + single instance. The seams (`QuoteProvider`, Socket.IO Redis adapter wiring, `csv_import` retention column) are pre-cut so the migration is a config flip, not a refactor.

---

## 9. Failure modes & SLOs

| Failure | Detection | Mitigation | Acceptable degradation |
|---|---|---|---|
| Yahoo down | poller error rate > 25% over 1 min | switch to mfapi/finnhub fallback per `QuoteProvider`; cache TTL extended to 5 min | stale quotes flagged in UI |
| MV refresh lag | Bull queue depth > 100 | debounce window expands to 1 s; UI badges show "syncing…" | up to 30s lag on holding views |
| WS disconnect | client heartbeat | client falls back to 30 s polling | no realtime; data still correct |
| CSV with garbage | zod validation | row-level reject with reasons; preview shows rejected rows | partial import allowed |
| Trade insert race (idempotency collision) | unique constraint | return original tradeId; never duplicate | idempotent retries safe |
| Postgres pool exhaustion | metric | poller backoff; user reads served from Redis cache | writes pause briefly |
| Excel onboard half-applied | TX abort | full rollback inside the `excel_import` parent TX | nothing applied |
| FX rate stale > 36h | timestamp check | banner on US/Net-Worth dashboard; values shown as "as of X" | UI honest about staleness |
| Vault decryption fails | decrypt error | redact field; log audit; never crash | PII hidden, rest works |

SLOs (single-user MVP):
- API p99 read < **300 ms**.
- Trade write → portfolio change reflected on every connected client < **2 s** (debounce 250ms + MV refresh + WS).
- Quote tick → render on a connected client < **1.5 s** end-to-end.
- Daily enrichment job complete < **10 min** for 30k tickers.

---

## 10. Open questions to resolve before Step 2

1. **Avg-cost policy on partial SELL** — keep "BUY-only weighted avg" (matches brokers) or model FIFO from day one? My MVP default: BUY-only.
2. **Cost basis snapshot on SELL** — store `cost_basis_at_sell` on every SELL trade row to make Sold-Shares journal immutable? My default: yes.
3. **Excel onboarding semantics** — for sheets like NIFTY50/NIFTYIT: are these *watchlists with type=INDEX* (no holdings) or are the qty columns inside them duplicates of broker data we should ignore? My read: the qty columns are duplicates (denormalised in Excel for convenience); we ignore them on import and rely on broker sheets only. Confirm.
4. **Dividend ledger** — derive expected dividends from `ticker_meta.calendarEvents` and let user reconcile, or strictly user-entered? My default: auto-derive expected, user marks "received" with deposit date.
5. **US Investing "Package" mode** — your Excel has Package vs Manual. Package == ESPP/RSU vested; should it have separate vesting-schedule entity, or fold into a `tag` field on Trade? My default: a `lot_kind` enum on Trade (`OPEN_MARKET | ESPP | RSU | BONUS | SPLIT`).
6. **Mutual fund maturity & ULIP** — is maturity a hard event we project P/L against, or just a reminder? My default: reminder + projection card.
7. **Personal vault scope** — encrypt at column level (AES-256 with KMS-managed DEK per row) or rely on Supabase Vault's `secrets` table? My default: Supabase Vault for secrets, column-level for PII fields like Nominee, PAN, Demat.
8. **Soft delete vs hard delete** — for Trade I want soft delete with audit reason ("CSV correction", "Wrong broker"). Confirm.

Answer these and Step 2 (DDL + RLS + seam interfaces) follows.

---

## 11. What Step 2 will deliver (preview)

- Full Postgres DDL for ~22 tables.
- RLS policies for every table (`USING (user_id = auth.uid())`).
- The four materialized views and their refresh triggers.
- Seam interfaces in TypeScript:
  - `QuoteProvider` (Yahoo, Finnhub, Google fallback)
  - `MutualFundProvider` (mfapi.in)
  - `FxProvider` (exchangerate.host)
  - `CryptoProvider` (CoinGecko)
  - `GoldProvider` (MCX scrape, IBJA scrape; behind a circuit breaker)
  - `CsvParser` + `BrokerCsvProfile` JSON schema
  - `ExcelParser` (multi-sheet wrapper around CsvParser)

Stop here. Awaiting answers on §10 before Step 2.
