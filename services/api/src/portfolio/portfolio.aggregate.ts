/**
 * Pure-domain consolidated portfolio aggregation — the "Summary" sheet pivot.
 *
 * Inputs:
 *   - holdings: rows from v_holding (one per user×broker×ticker, qty>0)
 *   - quotes:   current quotes for those tickers
 *   - brokers:  the user's broker list (drives column order)
 *
 * Output: one row per ticker held in any broker, with per-broker pair of
 *   (qty, avgCost) for every broker (zero-filled when broker has no holding),
 *   plus aggregate columns identical to the Excel Summary sheet:
 *   totalQty, currentPrice, currentValue, finalAvgValue (weighted),
 *   todaysChange, todaysChangePct, investedValue, totalPnl, totalPnlPct,
 *   percentOfPortfolio.
 */

import { D, Money, sum, weightedAvg, ZERO } from '../common/types/money';

export interface PortfolioInputHolding {
  brokerId: string;
  ticker: string;
  qty: Money;
  avgCost: Money;
  invested: Money;
}
export interface PortfolioInputQuote {
  ticker: string;
  ltp: Money;
  prevClose: Money;
}
export interface PortfolioInputBroker {
  id: string;
  displayName: string;
  sortOrder: number;
}

export interface PerBrokerCell {
  brokerId: string;
  brokerName: string;
  qty: Money;
  avgCost: Money;
}
export interface PortfolioRow {
  ticker: string;
  totalQty: Money;
  currentPrice: Money;
  currentValue: Money;
  finalAvgValue: Money;
  investedValue: Money;
  totalPnl: Money;
  totalPnlPct: Money;
  todaysChange: Money;
  todaysChangePct: Money;
  percentOfPortfolio: Money;
  perBroker: PerBrokerCell[]; // ordered by broker.sortOrder
}
export interface PortfolioAggregate {
  rows: PortfolioRow[];
  totalInvested: Money;
  totalCurrentValue: Money;
  overallProfit: Money;
  overallProfitPct: Money;
  todaysTotalProfit: Money;
}

export const aggregatePortfolio = (
  holdings: readonly PortfolioInputHolding[],
  quotes: ReadonlyMap<string, PortfolioInputQuote>,
  brokers: readonly PortfolioInputBroker[],
): PortfolioAggregate => {
  const sortedBrokers = [...brokers].sort((a, b) => a.sortOrder - b.sortOrder);

  // group by ticker
  const byTicker = new Map<string, PortfolioInputHolding[]>();
  for (const h of holdings) {
    const arr = byTicker.get(h.ticker) ?? [];
    arr.push(h);
    byTicker.set(h.ticker, arr);
  }

  const rowsRaw: PortfolioRow[] = [];
  for (const [ticker, hs] of byTicker) {
    const quote = quotes.get(ticker);
    const ltp = quote?.ltp ?? ZERO;
    const prevClose = quote?.prevClose ?? ZERO;

    const totalQty = sum(hs.map((h) => h.qty));
    if (totalQty.isZero()) continue;

    const finalAvgValue = weightedAvg(
      hs.map((h) => ({ qty: h.qty, price: h.avgCost })),
    );
    const investedValue = sum(hs.map((h) => h.invested));
    const currentValue = totalQty.mul(ltp);
    const totalPnl = currentValue.sub(investedValue);
    const totalPnlPct = investedValue.isZero()
      ? ZERO
      : totalPnl.div(investedValue);
    const todaysChange = totalQty.mul(ltp.sub(prevClose));
    const todaysChangePct = prevClose.isZero()
      ? ZERO
      : ltp.sub(prevClose).div(prevClose);

    const perBroker: PerBrokerCell[] = sortedBrokers.map((b) => {
      const h = hs.find((x) => x.brokerId === b.id);
      return {
        brokerId: b.id,
        brokerName: b.displayName,
        qty: h?.qty ?? ZERO,
        avgCost: h?.avgCost ?? ZERO,
      };
    });

    rowsRaw.push({
      ticker,
      totalQty,
      currentPrice: ltp,
      currentValue,
      finalAvgValue,
      investedValue,
      totalPnl,
      totalPnlPct,
      todaysChange,
      todaysChangePct,
      percentOfPortfolio: ZERO, // back-filled below
      perBroker,
    });
  }

  const totalCurrentValue = sum(rowsRaw.map((r) => r.currentValue));
  const totalInvested = sum(rowsRaw.map((r) => r.investedValue));
  const overallProfit = totalCurrentValue.sub(totalInvested);
  const overallProfitPct = totalInvested.isZero()
    ? ZERO
    : overallProfit.div(totalInvested);
  const todaysTotalProfit = sum(rowsRaw.map((r) => r.todaysChange));

  const rows = rowsRaw.map<PortfolioRow>((r) => ({
    ...r,
    percentOfPortfolio: totalCurrentValue.isZero()
      ? ZERO
      : r.currentValue.div(totalCurrentValue),
  }));

  // stable order: by currentValue desc (frontend may resort)
  rows.sort((a, b) => b.currentValue.cmp(a.currentValue));

  return {
    rows,
    totalInvested,
    totalCurrentValue,
    overallProfit,
    overallProfitPct,
    todaysTotalProfit,
  };
};
