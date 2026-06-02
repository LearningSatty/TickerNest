/**
 * Pure-domain holding upsert planner.
 *
 * Avg-cost is user-supplied; we never derive it from a trade history.
 * The one rule we DO enforce: when an edit decreases qty, we synthesise a
 * SoldShare row with `cost_basis_at_sell` = the AVG AT EDIT TIME (the old avg).
 * This snapshot is what makes the Sold-Shares journal historical even when the
 * user later changes their avg.
 *
 * This module is pure: given (current, requested), it returns a Plan that the
 * persistence layer applies inside a single TX.
 */
import { D, Money } from '../common/types/money';

export interface HoldingState {
  qty: Money;
  avgCost: Money;
}

export interface HoldingUpsertRequest {
  /** What the user wants the row to look like AFTER the write. */
  desired: HoldingState;
  /** Optional sell-side metadata if the user is recording a sell explicitly. */
  soldPrice?: Money;
  reason?: string;
  mistake?: string;
}

export type Plan =
  | { kind: 'NOOP' }
  | { kind: 'INSERT'; next: HoldingState }
  | { kind: 'UPDATE'; next: HoldingState; soldShare?: PlannedSoldShare }
  | { kind: 'DELETE'; soldShare: PlannedSoldShare };

export interface PlannedSoldShare {
  qty: Money;
  costBasisAtSell: Money; // snapshot of old avg
  soldPrice: Money | null;
  reason: string | null;
  mistake: string | null;
}

export const planHoldingUpsert = (
  current: HoldingState | null,
  req: HoldingUpsertRequest,
): Plan => {
  const { desired } = req;

  // Brand new holding
  if (!current) {
    if (desired.qty.lte(0)) {
      // Inserting a "holding" of qty=0 makes no sense; reject upstream.
      return { kind: 'NOOP' };
    }
    return { kind: 'INSERT', next: desired };
  }

  const sameQty = current.qty.eq(desired.qty);
  const sameAvg = current.avgCost.eq(desired.avgCost);
  if (sameQty && sameAvg) return { kind: 'NOOP' };

  // Qty decreased → record a SoldShare (cost basis snapshotted from OLD avg).
  if (desired.qty.lt(current.qty)) {
    const soldQty = current.qty.sub(desired.qty);
    const soldShare: PlannedSoldShare = {
      qty: soldQty,
      costBasisAtSell: current.avgCost, // immutable historical snapshot
      soldPrice: req.soldPrice ?? null,
      reason: req.reason ?? null,
      mistake: req.mistake ?? null,
    };
    if (desired.qty.isZero()) {
      return { kind: 'DELETE', soldShare };
    }
    return { kind: 'UPDATE', next: desired, soldShare };
  }

  // Qty same or increased → straight update, no SoldShare.
  return { kind: 'UPDATE', next: desired };
};
