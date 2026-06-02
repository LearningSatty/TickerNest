import { D } from '../../common/types/money';
import {
  aggregatePortfolio,
  PortfolioInputBroker,
  PortfolioInputHolding,
  PortfolioInputQuote,
} from '../portfolio.aggregate';

const broker = (id: string, name: string, sortOrder: number): PortfolioInputBroker => ({
  id,
  displayName: name,
  sortOrder,
});
const h = (
  brokerId: string,
  ticker: string,
  qty: number,
  avg: number,
  invested?: number,
): PortfolioInputHolding => ({
  brokerId,
  ticker,
  qty: D(qty),
  avgCost: D(avg),
  invested: D(invested ?? qty * avg),
});
const q = (ticker: string, ltp: number, prevClose: number): PortfolioInputQuote => ({
  ticker,
  ltp: D(ltp),
  prevClose: D(prevClose),
});
const qmap = (...quotes: PortfolioInputQuote[]) => new Map(quotes.map((x) => [x.ticker, x]));

describe('aggregatePortfolio', () => {
  it('empty input → all-zero aggregate, no rows', () => {
    const out = aggregatePortfolio([], qmap(), []);
    expect(out.rows).toHaveLength(0);
    expect(out.totalInvested.toString()).toBe('0');
    expect(out.totalCurrentValue.toString()).toBe('0');
    expect(out.overallProfit.toString()).toBe('0');
    expect(out.overallProfitPct.toString()).toBe('0');
    expect(out.todaysTotalProfit.toString()).toBe('0');
  });

  it('single ticker, single broker', () => {
    const brokers = [broker('B1', 'Groww', 1)];
    const out = aggregatePortfolio(
      [h('B1', 'INFY', 10, 1500)],
      qmap(q('INFY', 1600, 1580)),
      brokers,
    );
    expect(out.rows).toHaveLength(1);
    const r = out.rows[0]!;
    expect(r.totalQty.toString()).toBe('10');
    expect(r.currentValue.toString()).toBe('16000');
    expect(r.investedValue.toString()).toBe('15000');
    expect(r.totalPnl.toString()).toBe('1000');
    expect(r.todaysChange.toString()).toBe('200'); // (1600-1580)*10
    expect(r.percentOfPortfolio.toString()).toBe('1');
    expect(r.perBroker).toHaveLength(1);
    expect(r.perBroker[0]!.qty.toString()).toBe('10');
  });

  it('one ticker, two brokers — pivots correctly and respects broker order', () => {
    const brokers = [broker('B2', 'KITE', 2), broker('B1', 'Groww', 1)];
    const out = aggregatePortfolio(
      [h('B1', 'INFY', 10, 1500), h('B2', 'INFY', 5, 1700)],
      qmap(q('INFY', 1600, 1580)),
      brokers,
    );
    const r = out.rows[0]!;
    expect(r.totalQty.toString()).toBe('15');
    expect(r.finalAvgValue.toFixed(4)).toBe('1566.6667'); // (10*1500 + 5*1700)/15
    // perBroker ordered by sortOrder ascending: Groww(1) first
    expect(r.perBroker.map((c) => c.brokerName)).toEqual(['Groww', 'KITE']);
    expect(r.perBroker[0]!.qty.toString()).toBe('10');
    expect(r.perBroker[1]!.qty.toString()).toBe('5');
  });

  it('zero-fills brokers that hold none of a ticker', () => {
    const brokers = [broker('B1', 'Groww', 1), broker('B2', 'KITE', 2)];
    const out = aggregatePortfolio(
      [h('B1', 'INFY', 10, 1500)],
      qmap(q('INFY', 1600, 1600)),
      brokers,
    );
    const cells = out.rows[0]!.perBroker;
    expect(cells.find((c) => c.brokerName === 'KITE')!.qty.toString()).toBe('0');
  });

  it('multi-ticker: percentOfPortfolio sums to 1.0', () => {
    const brokers = [broker('B1', 'Groww', 1)];
    const out = aggregatePortfolio(
      [h('B1', 'INFY', 10, 1500), h('B1', 'TCS', 5, 3000)],
      qmap(q('INFY', 1600, 1580), q('TCS', 4000, 3950)),
      brokers,
    );
    const sumPct = out.rows
      .map((r) => r.percentOfPortfolio)
      .reduce((a, b) => a.add(b), D(0));
    expect(sumPct.toString()).toBe('1');
    expect(out.totalInvested.toString()).toBe('30000'); // 15000 + 15000
    expect(out.totalCurrentValue.toString()).toBe('36000'); // 16000 + 20000
    expect(out.overallProfit.toString()).toBe('6000');
  });

  it('skips qty=0 rows so a fully sold ticker disappears', () => {
    const brokers = [broker('B1', 'Groww', 1)];
    const out = aggregatePortfolio(
      [h('B1', 'INFY', 0, 1500, 0)],
      qmap(q('INFY', 1600, 1580)),
      brokers,
    );
    expect(out.rows).toHaveLength(0);
  });

  it('handles missing quote: currentValue=0, todaysChange=0, no NaN', () => {
    const brokers = [broker('B1', 'Groww', 1)];
    const out = aggregatePortfolio(
      [h('B1', 'INFY', 10, 1500)],
      qmap(),
      brokers,
    );
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]!.currentValue.toString()).toBe('0');
    expect(out.rows[0]!.todaysChange.toString()).toBe('0');
  });

  it('sorts rows by currentValue descending (default)', () => {
    const brokers = [broker('B1', 'Groww', 1)];
    const out = aggregatePortfolio(
      [h('B1', 'A', 1, 100), h('B1', 'B', 1, 100), h('B1', 'C', 1, 100)],
      qmap(q('A', 200, 200), q('B', 500, 500), q('C', 300, 300)),
      brokers,
    );
    expect(out.rows.map((r) => r.ticker)).toEqual(['B', 'C', 'A']);
  });
});
