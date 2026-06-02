import { D, sum, weightedAvg, toWire, ZERO } from '../types/money';

describe('money utilities', () => {
  it('D() parses string to Decimal', () => {
    expect(D('123.4567').toString()).toBe('123.4567');
  });

  it('sum() adds decimals', () => {
    expect(sum([D('10.5'), D('20.3'), D('5.2')]).toString()).toBe('36');
  });

  it('weightedAvg() computes correctly', () => {
    const pairs = [
      { qty: D('10'), price: D('100') },
      { qty: D('20'), price: D('150') },
    ];
    expect(weightedAvg(pairs).toFixed(4)).toBe('133.3333');
  });

  it('weightedAvg() returns ZERO for empty qty', () => {
    const pairs = [{ qty: D('0'), price: D('100') }];
    expect(weightedAvg(pairs).eq(ZERO)).toBe(true);
  });

  it('toWire() formats to 4 decimal places', () => {
    expect(toWire(D('123.456789'))).toBe('123.4568');
  });
});
