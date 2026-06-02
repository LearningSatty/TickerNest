import { describe, it, expect } from 'vitest';
import { formatMoney, formatPct, formatSignedMoney, trendClass, formatQty } from '../format';

describe('formatMoney INR (Indian grouping)', () => {
  it('groups lakhs + crores correctly', () => {
    expect(formatMoney('4422540.74')).toBe('44,22,540.74');
    expect(formatMoney('6288819.43')).toBe('62,88,819.43');
  });
  it('precision is preserved at large magnitudes (no Number coercion loss)', () => {
    expect(formatMoney('123456789012345.67')).toBe(
      '12,34,56,78,90,12,345.67',
    );
  });
  it('two fractional digits always shown', () => {
    expect(formatMoney('100')).toBe('100.00');
  });
});

describe('formatPct', () => {
  it('decimal fraction → human percent with sign', () => {
    expect(formatPct('0.0421')).toBe('+4.21%');
    expect(formatPct('-0.0095')).toBe('-0.95%');
  });
  it('zero is unsigned', () => {
    expect(formatPct('0')).toBe('0.00%');
  });
});

describe('formatSignedMoney', () => {
  it('+ for positive, - for negative', () => {
    expect(formatSignedMoney('15190.51')).toBe('+15,190.51');
    expect(formatSignedMoney('-432.04')).toBe('-432.04');
  });
});

describe('trendClass', () => {
  it('returns gain/loss/flat colour classes', () => {
    expect(trendClass('1')).toBe('text-gain');
    expect(trendClass('-1')).toBe('text-loss');
    expect(trendClass('0')).toBe('text-flat');
  });
});

describe('formatQty', () => {
  it('strips trailing decimal zeros', () => {
    expect(formatQty('10.0000')).toBe('10');
    expect(formatQty('10.5000')).toBe('10.5');
  });
});
