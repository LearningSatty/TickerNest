import { Injectable } from '@nestjs/common';
import { D } from '../common/types/money';
import { DbService } from '../common/db.service';
import { QuoteCache } from '../quote/quote.cache';
import { aggregatePortfolio, PortfolioInputBroker, PortfolioInputHolding, PortfolioInputQuote } from './portfolio.aggregate';

interface HoldingDbRow {
  broker_id: string;
  source_ticker: string;
  resolved_ticker: string;
  qty: string;
  avg_cost: string;
}
interface BrokerDbRow {
  id: string;
  display_name: string;
  sort_order: number;
}
interface MetaDbRow {
  ticker: string;
  name: string | null;
  sector: string | null;
}

@Injectable()
export class PortfolioService {
  constructor(
    private readonly db: DbService,
    private readonly quotes: QuoteCache,
  ) {}

  async getConsolidated(userId: string) {
    return this.db.withUserTx(userId, async (tx) => {
      const [holdingsR, brokersR] = await Promise.all([
        tx.query<HoldingDbRow>(
          `SELECT broker_id, source_ticker, resolved_ticker, qty::text AS qty, avg_cost::text AS avg_cost
             FROM holding
            WHERE user_id = $1 AND qty > 0`,
          [userId],
        ),
        tx.query<BrokerDbRow>(
          `SELECT id, display_name, sort_order
             FROM broker
            WHERE user_id = $1 AND deleted_at IS NULL
            ORDER BY sort_order, display_name`,
          [userId],
        ) as Promise<{ rows: BrokerDbRow[] }>,
      ]);
      const resolvedTickers = [...new Set(holdingsR.rows.map((r) => r.resolved_ticker))];
      const metaR = await tx.query<MetaDbRow>(
        `SELECT ticker, name, sector FROM ticker_meta WHERE ticker = ANY($1)`,
        [resolvedTickers as unknown[]],
      );
      const meta = new Map(metaR.rows.map((m) => [m.ticker, m] as const));
      const quoteMap = await this.quotes.getMany(resolvedTickers);

      const holdings: PortfolioInputHolding[] = holdingsR.rows.map((r) => ({
        brokerId: r.broker_id,
        ticker: r.resolved_ticker,
        qty: D(r.qty),
        avgCost: D(r.avg_cost),
        invested: D(r.qty).mul(D(r.avg_cost)),
      }));
      const brokers: PortfolioInputBroker[] = brokersR.rows.map((b) => ({
        id: b.id, displayName: b.display_name, sortOrder: b.sort_order,
      }));
      const quotes = new Map<string, PortfolioInputQuote>(
        [...quoteMap.entries()].map(([ticker, q]) => [
          ticker,
          { ticker, ltp: q.ltp, prevClose: q.prevClose },
        ]),
      );
      const agg = aggregatePortfolio(holdings, quotes, brokers);

      return {
        rows: agg.rows.map((row) => ({
          ticker: row.ticker,
          name: meta.get(row.ticker)?.name ?? null,
          sector: meta.get(row.ticker)?.sector ?? null,
          totalQty: row.totalQty.toFixed(4),
          currentPrice: row.currentPrice.toFixed(4),
          currentValue: row.currentValue.toFixed(4),
          finalAvgValue: row.finalAvgValue.toFixed(4),
          investedValue: row.investedValue.toFixed(4),
          totalPnl: row.totalPnl.toFixed(4),
          totalPnlPct: row.totalPnlPct.toString(),
          todaysChange: row.todaysChange.toFixed(4),
          todaysChangePct: row.todaysChangePct.toString(),
          percentOfPortfolio: row.percentOfPortfolio.toString(),
          perBroker: row.perBroker.map((c) => ({
            brokerId: c.brokerId,
            brokerName: c.brokerName,
            qty: c.qty.toFixed(4),
            avgCost: c.avgCost.toFixed(4),
          })),
        })),
        brokers: brokersR.rows.map((b) => ({
          id: b.id,
          displayName: b.display_name,
          sortOrder: b.sort_order,
          name: '',
          currency: 'INR' as const,
          exchangeDefault: 'NSE',
        })),
        totalInvested: agg.totalInvested.toFixed(4),
        totalCurrentValue: agg.totalCurrentValue.toFixed(4),
        overallProfit: agg.overallProfit.toFixed(4),
        overallProfitPct: agg.overallProfitPct.toString(),
        todaysTotalProfit: agg.todaysTotalProfit.toFixed(4),
      };
    });
  }

  async getBySector(userId: string) {
    const c = await this.getConsolidated(userId);
    // Single-pass group by sector, preserving the existing row shape.
    const bySector = new Map<string, typeof c.rows>();
    for (const row of c.rows) {
      const k = row.sector ?? 'UNKNOWN';
      const arr = bySector.get(k) ?? [];
      arr.push(row);
      bySector.set(k, arr);
    }
    return {
      ...c,
      groups: [...bySector.entries()]
        .map(([sector, rows]) => ({ sector, rows }))
        .sort((a, b) => a.sector.localeCompare(b.sector)),
    };
  }
}

export { aggregatePortfolio };
