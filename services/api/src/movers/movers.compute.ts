/**
 * Pure-domain movers calc — runs on a user's universe given quotes.
 * No I/O. Threshold is configurable per user (default 10%).
 */
import { D, Money, ZERO } from '../common/types/money';

export interface MoverInput {
  ticker: string;
  ltp: Money;
  prevClose: Money;
}

export interface MoverRow {
  ticker: string;
  changePct: Money; // signed, fraction (0.10 == 10%)
  changeAbs: Money;
  ltp: Money;
}

export interface Movers {
  gainers: MoverRow[];
  losers: MoverRow[];
}

export const computeMovers = (
  universe: readonly MoverInput[],
  thresholdPct = D('0.10'),
): Movers => {
  const gainers: MoverRow[] = [];
  const losers: MoverRow[] = [];
  for (const q of universe) {
    if (q.prevClose.isZero()) continue; // can't compute pct
    const changeAbs = q.ltp.sub(q.prevClose);
    const changePct = changeAbs.div(q.prevClose);
    if (changePct.abs().lt(thresholdPct)) continue;
    const row: MoverRow = { ticker: q.ticker, changePct, changeAbs, ltp: q.ltp };
    if (changePct.isPositive()) gainers.push(row);
    else losers.push(row);
  }
  gainers.sort((a, b) => b.changePct.cmp(a.changePct));
  losers.sort((a, b) => a.changePct.cmp(b.changePct));
  return { gainers, losers };
};
