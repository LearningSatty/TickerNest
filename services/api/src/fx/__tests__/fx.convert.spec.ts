import { D } from '../../common/types/money';
import { convert } from '../fx.convert';
import { FxRate } from '../../common/providers/fx.provider';

const now = new Date('2026-05-28T10:00:00Z');
const fresh: FxRate = {
  from: 'USD',
  to: 'INR',
  rate: D(83.5),
  asOf: new Date('2026-05-28T05:00:00Z'),
};

describe('convert', () => {
  it('same-currency is a passthrough', () => {
    expect(convert(D(100), fresh, 'INR', 'INR', now).toString()).toBe('100');
  });

  it('USD→INR multiplies by rate', () => {
    expect(convert(D(100), fresh, 'USD', 'INR', now).toString()).toBe('8350');
  });

  it('throws when the rate direction does not match', () => {
    expect(() => convert(D(100), fresh, 'INR', 'USD', now)).toThrow(
      /FX rate mismatch/,
    );
  });

  it('throws when the rate is older than maxAgeHours', () => {
    const stale: FxRate = {
      ...fresh,
      asOf: new Date('2026-05-25T05:00:00Z'), // ~77h old vs now
    };
    expect(() => convert(D(100), stale, 'USD', 'INR', now)).toThrow(/stale/);
  });

  it('respects custom maxAgeHours', () => {
    const old: FxRate = {
      ...fresh,
      asOf: new Date('2026-05-28T03:00:00Z'), // 7h old
    };
    expect(() => convert(D(100), old, 'USD', 'INR', now, 6)).toThrow(/stale/);
    expect(convert(D(100), old, 'USD', 'INR', now, 8).toString()).toBe('8350');
  });
});
