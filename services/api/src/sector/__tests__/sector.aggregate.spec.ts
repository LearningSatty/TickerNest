import { D } from '../../common/types/money';
import { aggregateSector, SectorInput } from '../sector.aggregate';

const r = (
  brokerId: string,
  ticker: string,
  qty: number,
  sector: string | null,
  ltp: number,
  prev: number,
): SectorInput => ({
  brokerId,
  ticker,
  qty: D(qty),
  sector,
  ltp: D(ltp),
  prevClose: D(prev),
});

describe('aggregateSector', () => {
  it('groups by broker × sector and sums values', () => {
    const out = aggregateSector([
      r('B1', 'INFY', 10, 'IT', 1600, 1580),
      r('B1', 'TCS', 5, 'IT', 4000, 3950),
      r('B1', 'HDFC', 4, 'BFSI', 1700, 1650),
    ]);
    const it = out.find((x) => x.sector === 'IT')!;
    expect(it.currentValue.toString()).toBe('36000'); // 10*1600 + 5*4000
    expect(it.prevValue.toString()).toBe('35550'); // 10*1580 + 5*3950
    expect(it.dayChangeValue.toString()).toBe('450');
    const bfsi = out.find((x) => x.sector === 'BFSI')!;
    expect(bfsi.currentValue.toString()).toBe('6800');
  });

  it('null sectors collapse into UNKNOWN', () => {
    const out = aggregateSector([r('B1', 'X', 1, null, 100, 100)]);
    expect(out[0]!.sector).toBe('UNKNOWN');
  });

  it('different brokers stay separate', () => {
    const out = aggregateSector([
      r('B1', 'INFY', 10, 'IT', 1600, 1580),
      r('B2', 'INFY', 5, 'IT', 1600, 1580),
    ]);
    expect(out).toHaveLength(2);
  });

  it('day-change pct never NaN when prev is zero', () => {
    const out = aggregateSector([r('B1', 'X', 1, 'IT', 100, 0)]);
    expect(out[0]!.dayChangePct.toString()).toBe('0');
  });
});
