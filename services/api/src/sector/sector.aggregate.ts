/**
 * Pure-domain sector aggregation — drives the broker-page sector strip
 * (matches "Day Averages Value" / sector totals in the Excel header).
 */
import { D, Money, sum, ZERO } from '../common/types/money';

export interface SectorInput {
  brokerId: string;
  ticker: string;
  qty: Money;
  sector: string | null;
  ltp: Money;
  prevClose: Money;
}

export interface SectorRow {
  brokerId: string;
  sector: string;
  currentValue: Money;
  prevValue: Money;
  dayChangeValue: Money;
  dayChangePct: Money;
}

const UNKNOWN = 'UNKNOWN';

export const aggregateSector = (rows: readonly SectorInput[]): SectorRow[] => {
  const groups = new Map<string, SectorInput[]>();
  for (const r of rows) {
    const key = `${r.brokerId}::${r.sector ?? UNKNOWN}`;
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }

  const out: SectorRow[] = [];
  for (const [key, members] of groups) {
    const [brokerId, sector] = key.split('::') as [string, string];
    const currentValue = sum(members.map((m) => m.qty.mul(m.ltp)));
    const prevValue = sum(members.map((m) => m.qty.mul(m.prevClose)));
    const dayChangeValue = currentValue.sub(prevValue);
    const dayChangePct = prevValue.isZero() ? ZERO : dayChangeValue.div(prevValue);
    out.push({ brokerId, sector, currentValue, prevValue, dayChangeValue, dayChangePct });
  }
  return out.sort(
    (a, b) => a.brokerId.localeCompare(b.brokerId) || b.currentValue.cmp(a.currentValue),
  );
};
