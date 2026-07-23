import { Injectable, Logger } from '@nestjs/common';
import { D } from '../common/types/money';
import { HoldingRepository } from './holding.repository';
import { UpsertHoldingDto } from './holding.dto';
import { DbService } from '../common/db.service';
import { QuoteCache } from '../quote/quote.cache';

@Injectable()
export class HoldingService {
  private readonly log = new Logger(HoldingService.name);
  constructor(
    private readonly repo: HoldingRepository,
    private readonly db: DbService,
    private readonly quotes: QuoteCache,
  ) {}

  async listForBroker(userId: string, brokerId: string) {
    const rows = await this.repo.listForBroker(userId, brokerId);
    const resolvedTickers = rows.map((r) => r.resolved_ticker);

    // Fetch ticker_meta for names/market_type/pe (keyed by resolved_ticker)
    const metaR = resolvedTickers.length > 0
      ? await this.db.query<{ ticker: string; name: string | null; market_type: string | null; pe_ratio: string | null }>(
          `SELECT ticker, name, market_type, pe_ratio FROM ticker_meta WHERE ticker = ANY($1)`,
          [resolvedTickers],
        )
      : { rows: [] };
    const metaMap = new Map(metaR.rows.map((m) => [m.ticker, m] as const));

    // Fetch sector/domain names from master tables
    const holdingIds = rows.map((r) => r.id);
    const sectorR = holdingIds.length > 0
      ? await this.db.query<{ holding_id: string; sector_name: string | null; domain_name: string | null }>(
          `SELECT h.id AS holding_id, s.name AS sector_name, sd.name AS domain_name
           FROM holding h
           LEFT JOIN sector s ON h.sector_id = s.id
           LEFT JOIN sector_domain sd ON h.sector_domain_id = sd.id
           WHERE h.id = ANY($1)`,
          [holdingIds],
        )
      : { rows: [] };
    const sectorMap = new Map(sectorR.rows.map((r) => [r.holding_id, r] as const));

    // Fetch live quotes using resolved_ticker (Yahoo format)
    const quoteMap = await this.quotes.getMany(resolvedTickers);

    return rows.map((r) => {
      const meta = metaMap.get(r.resolved_ticker);
      const q = quoteMap.get(r.resolved_ticker);
      const sec = sectorMap.get(r.id);
      return {
        brokerId: r.broker_id,
        ticker: r.resolved_ticker,
        sourceTicker: r.source_ticker,
        qty: r.qty,
        avgCost: r.avg_cost,
        name: meta?.name ?? null,
        sector: sec?.sector_name ?? null,
        sectorDomain: sec?.domain_name ?? null,
        sectorId: (r as unknown as Record<string, unknown>)['sector_id'] as string | null,
        sectorDomainId: (r as unknown as Record<string, unknown>)['sector_domain_id'] as string | null,
        marketType: meta?.market_type ?? null,
        currentPrice: q ? q.ltp.toFixed(4) : '0',
        prevClose: q ? q.prevClose.toFixed(4) : '0',
        peRatio: meta?.pe_ratio ?? null,
      };
    });
  }

  async addHolding(
    userId: string,
    brokerId: string,
    data: { ticker: string; qty: string; avgCost: string; sectorId?: string | undefined; sectorDomainId?: string | undefined },
  ) {
    const ticker = data.ticker.trim().toUpperCase();
    const qty = parseFloat(data.qty);
    const avg = parseFloat(data.avgCost);
    return this.db.withUserTx(userId, async (tx) => {
      await tx.query(
        `INSERT INTO holding (user_id, broker_id, source_ticker, resolved_ticker, qty, avg_cost, sector_id, sector_domain_id)
         VALUES ($1, $2, $3, $4, $5::numeric, $6::numeric, $7, $8)
         ON CONFLICT (user_id, broker_id, source_ticker) DO UPDATE
            SET qty = EXCLUDED.qty, avg_cost = EXCLUDED.avg_cost,
                sector_id = COALESCE(EXCLUDED.sector_id, holding.sector_id),
                sector_domain_id = COALESCE(EXCLUDED.sector_domain_id, holding.sector_domain_id)`,
        [userId, brokerId, ticker, ticker, qty, avg, data.sectorId ?? null, data.sectorDomainId ?? null],
      );
      return { ticker, qty: qty.toString(), avgCost: avg.toString() };
    });
  }

  async deleteHolding(userId: string, brokerId: string, ticker: string) {
    const t = ticker.trim().toUpperCase();
    return this.db.withUserTx(userId, async (tx) => {
      await tx.query(
        `DELETE FROM holding WHERE user_id = $1 AND broker_id = $2 AND resolved_ticker = $3`,
        [userId, brokerId, t],
      );
      return { deleted: true, ticker: t };
    });
  }

  async updateHolding(
    userId: string,
    brokerId: string,
    data: { oldTicker: string; ticker: string; qty: string; avgCost: string; sectorId?: string | null | undefined; sectorDomainId?: string | null | undefined },
  ) {
    return this.db.withUserTx(userId, async (tx) => {
      const newTicker = data.ticker.trim();
      const oldTicker = data.oldTicker.trim();
      const qty = parseFloat(data.qty);
      const avg = parseFloat(data.avgCost);

      if (oldTicker !== newTicker) {
        await tx.query(
          `DELETE FROM holding WHERE user_id = $1 AND broker_id = $2 AND resolved_ticker = $3`,
          [userId, brokerId, oldTicker],
        );
      }
      await tx.query(
        `INSERT INTO holding (user_id, broker_id, source_ticker, resolved_ticker, qty, avg_cost, sector_id, sector_domain_id)
         VALUES ($1, $2, $3, $4, $5::numeric, $6::numeric, $7, $8)
         ON CONFLICT (user_id, broker_id, source_ticker) DO UPDATE
            SET resolved_ticker = EXCLUDED.resolved_ticker,
                qty = EXCLUDED.qty,
                avg_cost = EXCLUDED.avg_cost,
                sector_id = COALESCE(EXCLUDED.sector_id, holding.sector_id),
                sector_domain_id = COALESCE(EXCLUDED.sector_domain_id, holding.sector_domain_id)`,
        [userId, brokerId, newTicker, newTicker, qty, avg, data.sectorId ?? null, data.sectorDomainId ?? null],
      );
      return { ticker: newTicker, qty: qty.toString(), avgCost: avg.toString() };
    });
  }

  async upsertIdempotent(
    userId: string,
    idempotencyKey: string,
    brokerId: string,
    ticker: string,
    dto: UpsertHoldingDto,
  ) {
    return this.repo.upsert(
      userId,
      idempotencyKey,
      brokerId,
      ticker,
      { qty: D(dto.qty), avgCost: D(dto.avgCost) },
      {
        ...(dto.soldPrice !== undefined && { soldPrice: D(dto.soldPrice) }),
        ...(dto.reason !== undefined && { reason: dto.reason }),
        ...(dto.mistake !== undefined && { mistake: dto.mistake }),
      },
    );
  }

  /**
   * Full-exit endpoint: qty → 0, avg_cost preserved on the row.
   * Always emits a sold_share for the prior qty.
   */
  async fullExit(
    userId: string,
    idempotencyKey: string,
    brokerId: string,
    ticker: string,
  ) {
    return this.repo.upsert(
      userId,
      idempotencyKey,
      brokerId,
      ticker,
      { qty: D(0), avgCost: D(0) }, // avg ignored; planner reads OLD avg from current
    );
  }
}
