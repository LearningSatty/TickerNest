import { Decimal } from 'decimal.js';

/**
 * Money is NEVER a number in this codebase. Always Decimal or string.
 * DB type: NUMERIC(20,4). Wire type: string.
 *
 * Construct via D() to centralise rounding mode; all financial maths runs
 * through these helpers so we can audit precision in one place.
 */
Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_EVEN });

export type Money = Decimal;
export const D = (v: Decimal.Value): Money => new Decimal(v ?? 0);
export const ZERO: Money = D(0);

export const isZero = (m: Money): boolean => m.isZero();
export const sum = (xs: Money[]): Money => xs.reduce((a, b) => a.add(b), ZERO);

/**
 * Weighted average: sum(qty_i * price_i) / sum(qty_i).
 * Returns ZERO when totalQty is 0 — never NaN, never throws.
 */
export const weightedAvg = (
  pairs: ReadonlyArray<{ qty: Money; price: Money }>,
): Money => {
  const totalQty = sum(pairs.map((p) => p.qty));
  if (totalQty.isZero()) return ZERO;
  const numerator = sum(pairs.map((p) => p.qty.mul(p.price)));
  return numerator.div(totalQty);
};

export const toWire = (m: Money): string => m.toFixed(4);
