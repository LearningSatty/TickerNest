/**
 * Money formatting. Inputs are always strings (NUMERIC). We use Decimal-aware
 * grouping; never rely on Number() which loses precision at INR 100Cr+.
 */
import Decimal from 'decimal.js';

const inrIntFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const usdIntFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export const formatMoney = (
  v: string | Decimal,
  currency: 'INR' | 'USD' = 'INR',
): string => {
  const d = new Decimal(v);
  const fmt = currency === 'INR' ? inrIntFmt : usdIntFmt;
  const s = d.abs().toFixed(2);
  const [int, frac = '00'] = s.split('.') as [string, string];
  // Number can lose precision past 2^53; format the integer string by chunking
  // ourselves for INR (Indian grouping) when it exceeds 15 digits.
  const grouped =
    int.length > 15
      ? indianGroup(int)
      : fmt.format(Number(int));
  const sign = d.isNegative() ? '-' : '';
  return `${sign}${grouped}.${frac}`;
};

const indianGroup = (intStr: string): string => {
  // Indian grouping: last 3, then commas every 2.
  if (intStr.length <= 3) return intStr;
  const head = intStr.slice(0, intStr.length - 3);
  const tail = intStr.slice(intStr.length - 3);
  const parts: string[] = [];
  let s = head;
  while (s.length > 2) {
    parts.unshift(s.slice(s.length - 2));
    s = s.slice(0, s.length - 2);
  }
  if (s) parts.unshift(s);
  return `${parts.join(',')},${tail}`;
};

export const formatPct = (v: string | Decimal, places = 2): string => {
  const d = new Decimal(v).mul(100);
  const sign = d.isPositive() && !d.isZero() ? '+' : '';
  return `${sign}${d.toFixed(places)}%`;
};

export const formatSignedMoney = (
  v: string | Decimal,
  currency: 'INR' | 'USD' = 'INR',
): string => {
  const d = new Decimal(v);
  const formatted = formatMoney(d, currency); // already prefixes '-' for negatives
  if (d.isPositive() && !d.isZero()) return `+${formatted}`;
  return formatted;
};

export const trendClass = (v: string | Decimal): string => {
  const d = new Decimal(v);
  if (d.isZero()) return 'text-flat';
  return d.isPositive() ? 'text-gain' : 'text-loss';
};

export const formatQty = (v: string | Decimal): string => {
  const d = new Decimal(v);
  // strip trailing zeros after decimal, max 4 places
  return d.toDecimalPlaces(4).toString();
};
