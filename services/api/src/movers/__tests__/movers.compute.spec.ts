import { D } from '../../common/types/money';
import { computeMovers } from '../movers.compute';

const u = (ticker: string, ltp: number, prev: number) => ({
  ticker,
  ltp: D(ltp),
  prevClose: D(prev),
});

describe('computeMovers', () => {
  it('default 10% threshold; ±5% are excluded', () => {
    const m = computeMovers([
      u('A', 105, 100), // +5% — out
      u('B', 110, 100), // +10% — included as gainer
      u('C', 90, 100), // -10% — included as loser
      u('D', 95, 100), // -5% — out
    ]);
    expect(m.gainers.map((x) => x.ticker)).toEqual(['B']);
    expect(m.losers.map((x) => x.ticker)).toEqual(['C']);
  });

  it('gainers sorted by change desc, losers ascending (most negative first)', () => {
    const m = computeMovers([
      u('A', 120, 100), // +20%
      u('B', 115, 100), // +15%
      u('C', 80, 100), // -20%
      u('D', 85, 100), // -15%
    ]);
    expect(m.gainers.map((x) => x.ticker)).toEqual(['A', 'B']);
    expect(m.losers.map((x) => x.ticker)).toEqual(['C', 'D']);
  });

  it('zero prevClose is silently skipped (no NaN)', () => {
    const m = computeMovers([u('X', 100, 0)]);
    expect(m.gainers).toHaveLength(0);
    expect(m.losers).toHaveLength(0);
  });

  it('respects custom threshold', () => {
    const m = computeMovers(
      [u('A', 103, 100), u('B', 95, 100)],
      D('0.02'), // 2%
    );
    expect(m.gainers).toHaveLength(1);
    expect(m.losers).toHaveLength(1);
  });

  it('empty universe → empty result', () => {
    const m = computeMovers([]);
    expect(m.gainers).toEqual([]);
    expect(m.losers).toEqual([]);
  });
});
