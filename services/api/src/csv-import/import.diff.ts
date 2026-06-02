/**
 * Pure-domain CSV import diff engine.
 *
 * Given the user's CURRENT holdings for a broker and a set of STAGED rows
 * (post-parse, post-mapping, post-zod-validation), classify each row as
 * ADD | UPDATE | UNCHANGED | REMOVE.
 *
 * Two import modes:
 *   - REPLACE: staged rows = full snapshot. Tickers in current but missing
 *     from staged are REMOVE.
 *   - MERGE:   staged rows = a partial update. No REMOVE classifications.
 *
 * Persistence semantics (v2 — manual avg model):
 *   ADD     → INSERT INTO holding (qty, avg_cost) VALUES (staged.qty, staged.avg)
 *   UPDATE  → UPDATE holding SET qty=staged.qty, avg_cost=staged.avg
 *             if staged.qty < current.qty → INSERT INTO sold_share with
 *               cost_basis_at_sell = current.avg_cost.
 *   REMOVE  → INSERT INTO sold_share (qty=current.qty, cost_basis=current.avg)
 *             then DELETE FROM holding.
 *   UNCHANGED → no-op.
 *
 * Quantities and prices are compared with NUMERIC equality (Decimal).
 */
import { D, Money } from '../common/types/money';

export interface CurrentHolding {
  ticker: string;
  qty: Money;
  avgCost: Money;
}
export interface StagedRow {
  ticker: string;
  qty: Money;
  avgCost: Money;
}

export type DiffMode = 'REPLACE' | 'MERGE';
export type DiffKind = 'ADD' | 'UPDATE' | 'UNCHANGED' | 'REMOVE';

export interface DiffRow {
  ticker: string;
  kind: DiffKind;
  current: CurrentHolding | null;
  staged: StagedRow | null;
  /** signed qty delta (positive = bought; negative = sold; 0 = avg-only edit). */
  qtyDelta: Money;
  /** the avg-cost the holding should be UPDATEd to. */
  newAvgCost: Money;
}

export interface DiffSummary {
  rows: DiffRow[];
  adds: number;
  updates: number;
  unchanged: number;
  removes: number;
}

const eq = (a: Money, b: Money) => a.eq(b);

export const computeImportDiff = (
  current: readonly CurrentHolding[],
  staged: readonly StagedRow[],
  mode: DiffMode,
): DiffSummary => {
  const currentByTicker = new Map(current.map((c) => [c.ticker, c]));
  const stagedByTicker = new Map(staged.map((s) => [s.ticker, s]));
  const tickers = new Set<string>([
    ...currentByTicker.keys(),
    ...stagedByTicker.keys(),
  ]);

  const rows: DiffRow[] = [];

  for (const ticker of tickers) {
    const cur = currentByTicker.get(ticker) ?? null;
    const stg = stagedByTicker.get(ticker) ?? null;

    if (cur && !stg) {
      if (mode === 'REPLACE') {
        rows.push({
          ticker,
          kind: 'REMOVE',
          current: cur,
          staged: null,
          qtyDelta: cur.qty.neg(), // sold_share gets full prior qty
          newAvgCost: D(0),
        });
      }
      // MERGE: ignore — staged didn't say anything about this ticker.
      continue;
    }

    if (!cur && stg) {
      rows.push({
        ticker,
        kind: 'ADD',
        current: null,
        staged: stg,
        qtyDelta: stg.qty,
        newAvgCost: stg.avgCost,
      });
      continue;
    }

    if (cur && stg) {
      if (eq(cur.qty, stg.qty) && eq(cur.avgCost, stg.avgCost)) {
        rows.push({
          ticker,
          kind: 'UNCHANGED',
          current: cur,
          staged: stg,
          qtyDelta: D(0),
          newAvgCost: cur.avgCost,
        });
        continue;
      }
      const delta = stg.qty.sub(cur.qty);
      rows.push({
        ticker,
        kind: 'UPDATE',
        current: cur,
        staged: stg,
        qtyDelta: delta,
        newAvgCost: stg.avgCost,
      });
    }
  }

  const summary: DiffSummary = {
    rows,
    adds: rows.filter((r) => r.kind === 'ADD').length,
    updates: rows.filter((r) => r.kind === 'UPDATE').length,
    unchanged: rows.filter((r) => r.kind === 'UNCHANGED').length,
    removes: rows.filter((r) => r.kind === 'REMOVE').length,
  };
  return summary;
};
