/**
 * Currency conversion. Always passes through a single helper so we can audit
 * staleness checks in one place. If the provided FxRate is older than
 * `maxAgeHours`, the call throws — callers MUST surface "as of" timestamps
 * to the UI rather than silently using stale FX.
 */
import { D, Money } from '../common/types/money';
import { FxRate } from '../common/providers/fx.provider';

const HOURS_MS = 60 * 60 * 1000;

export const convert = (
  amount: Money,
  rate: FxRate,
  fromCurrency: 'INR' | 'USD',
  toCurrency: 'INR' | 'USD',
  now: Date = new Date(),
  maxAgeHours = 36,
): Money => {
  if (fromCurrency === toCurrency) return amount;
  if (rate.from !== fromCurrency || rate.to !== toCurrency) {
    throw new Error(
      `FX rate mismatch: have ${rate.from}->${rate.to}, asked ${fromCurrency}->${toCurrency}`,
    );
  }
  const ageHours = (now.getTime() - rate.asOf.getTime()) / HOURS_MS;
  if (ageHours > maxAgeHours) {
    throw new Error(
      `FX rate stale: ${ageHours.toFixed(1)}h old (max ${maxAgeHours}h)`,
    );
  }
  return amount.mul(rate.rate);
};
