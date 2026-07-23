/**
 * TickerMetaEnricher — BullMQ scheduled job that runs once per day at 03:00 IST.
 *
 * It collects the full ticker universe (holding ∪ watchlist_item), fetches
 * `quoteSummary` data from Yahoo (name, sector, PE, market-cap, 52-wk, etc.)
 * and UPSERTs the enriched rows into `ticker_meta`.
 *
 * Why a separate job from the quote poller?
 *   1. `quoteSummary` is expensive per-ticker (one HTTP call vs a batched quote).
 *   2. This data changes once a day at most; refreshing it every 5 seconds is waste.
 *   3. Separation lets us tune rate-limiting independently.
 *
 * Rate limiting: one ticker per 200 ms → 5 tickers/s.
 * 100 tickers in a universe = 20 s cold-start.  Fine for 03:00 IST.
 *
 * BullMQ cron expression: "0 21 30 * * *" (21:30 UTC = 03:00 IST; uses 6-field cron).
 */
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, Job, ConnectionOptions } from 'bullmq';

import { DbService } from '../common/db.service';
import { QuoteProvider, TickerMetaSnapshot } from '../common/providers/quote.provider';

function parseBullConn(url: string): ConnectionOptions {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    ...(u.password ? { password: decodeURIComponent(u.password) } : {}),
    ...(u.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}

const QUEUE_NAME = 'tn:ticker-meta-enricher';
const JOB_NAME = 'enrich';
const CRON_SCHEDULE = '0 30 21 * * *'; // 21:30 UTC = 03:00 IST daily

// Rate-limit delay between individual ticker summaries (ms).
const TICKER_DELAY_MS = 200;

@Injectable()
export class TickerMetaEnricher implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(TickerMetaEnricher.name);

  private queue: Queue | null = null;
  private worker: Worker | null = null;

  constructor(
    private readonly cfg: ConfigService,
    private readonly db: DbService,
    @Optional() @Inject(QuoteProvider) private readonly provider: QuoteProvider | null,
  ) {}

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async onModuleInit(): Promise<void> {
    const url = this.cfg.get<string>('REDIS_URL');
    if (!url) {
      this.log.warn('REDIS_URL not set — ticker-meta enricher disabled');
      return;
    }
    if (!this.provider) {
      this.log.warn('No QuoteProvider injected — ticker-meta enricher disabled');
      return;
    }

    const conn = parseBullConn(url);

    this.queue = new Queue(QUEUE_NAME, { connection: conn });
    this.worker = new Worker(QUEUE_NAME, (job) => this.handleJob(job), {
      connection: conn,
      concurrency: 1,
    });

    this.worker.on('failed', (job, err) =>
      this.log.error(`ticker-meta enricher job ${job?.id ?? '?'} failed: ${err.message}`),
    );

    // BullMQ repeatable jobs are persistent in Redis — only add once.
    const repeatable = await this.queue.getRepeatableJobs();
    const exists = repeatable.some((r) => r.name === JOB_NAME);
    if (!exists) {
      await this.queue.add(JOB_NAME, {}, { repeat: { pattern: CRON_SCHEDULE, tz: 'UTC' } });
      this.log.log(`Ticker-meta enricher scheduled: ${CRON_SCHEDULE} UTC`);
    } else {
      this.log.log('Ticker-meta enricher already registered');
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }

  // ---------------------------------------------------------------------------
  // Job handler
  // ---------------------------------------------------------------------------

  private async handleJob(_job: Job): Promise<void> {
    this.log.log('ticker-meta enrichment started');
    const tickers = await this.buildUniverse();
    if (tickers.length === 0) {
      this.log.log('empty universe — nothing to enrich');
      return;
    }

    this.log.log(`Enriching ${tickers.length} tickers (${TICKER_DELAY_MS}ms delay each)`);

    // Rate-limited serial fetch; getMeta internally handles 429 retries via
    // the provider. If a single ticker fails, we skip it (best-effort enrichment).
    const successful: TickerMetaSnapshot[] = [];
    for (const ticker of tickers) {
      try {
        const result = await this.provider!.getMeta([ticker]);
        const snap = result.get(ticker);
        if (snap) successful.push(snap);
      } catch (e) {
        this.log.warn(`getMeta failed for ${ticker}: ${(e as Error).message}`);
      }
      if (TICKER_DELAY_MS > 0) await delay(TICKER_DELAY_MS);
    }

    if (successful.length > 0) {
      await this.upsertMeta(successful);
      this.log.log(`Enriched ${successful.length}/${tickers.length} tickers`);
    } else {
      this.log.warn('All getMeta calls failed — ticker_meta not updated');
    }
  }

  // ---------------------------------------------------------------------------
  // Public for tests
  // ---------------------------------------------------------------------------

  async buildUniverse(): Promise<string[]> {
    const res = await this.db.query<{ ticker: string }>(
      `SELECT DISTINCT ticker FROM holding  WHERE qty > 0
       UNION
       SELECT DISTINCT ticker FROM watchlist_item`,
    );
    return res.rows.map((r) => r.ticker);
  }

  async upsertMeta(snaps: TickerMetaSnapshot[]): Promise<void> {
    if (snaps.length === 0) return;

    const rows: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    for (const s of snaps) {
      rows.push(
        `($${i++}::text,
          $${i++}::text,
          $${i++}::text,
          $${i++}::text,
          $${i++}::text,
          $${i++}::numeric,
          $${i++}::numeric,
          $${i++}::numeric,
          $${i++}::numeric,
          $${i++}::bigint,
          $${i++}::date,
          NOW())`,
      );
      values.push(
        s.ticker,
        s.name,
        s.sector,
        s.sectorDomain,
        s.marketType,
        s.peRatio?.toFixed(4) ?? null,
        s.marketCap?.toFixed(2) ?? null,
        s.fiftyTwoWeekHigh?.toFixed(4) ?? null,
        s.fiftyTwoWeekLow?.toFixed(4) ?? null,
        s.avgVolume?.toString() ?? null,
        s.listingDate?.toISOString().split('T')[0] ?? null,
      );
    }

    await this.db.query(
      `INSERT INTO ticker_meta
         (ticker, name, sector, sector_domain, market_type,
          pe_ratio, market_cap, fifty_two_wk_high, fifty_two_wk_low,
          avg_volume, listing_date, meta_refreshed_at)
       VALUES ${rows.join(', ')}
       ON CONFLICT (ticker) DO UPDATE SET
         -- Prefer the longer/richer name (never downgrade from a full name to
         -- a short one if both are non-null).
         name                = CASE
                                 WHEN LENGTH(EXCLUDED.name) >= LENGTH(COALESCE(ticker_meta.name, ''))
                                 THEN EXCLUDED.name
                                 ELSE ticker_meta.name
                               END,
         sector              = EXCLUDED.sector,
         sector_domain       = EXCLUDED.sector_domain,
         market_type         = EXCLUDED.market_type,
         pe_ratio            = EXCLUDED.pe_ratio,
         market_cap          = EXCLUDED.market_cap,
         fifty_two_wk_high   = EXCLUDED.fifty_two_wk_high,
         fifty_two_wk_low    = EXCLUDED.fifty_two_wk_low,
         avg_volume          = EXCLUDED.avg_volume,
         listing_date        = EXCLUDED.listing_date,
         meta_refreshed_at   = EXCLUDED.meta_refreshed_at`,
      values,
    );
  }
}

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
