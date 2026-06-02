/**
 * QuotePollerService — self-scheduling BullMQ job that keeps the quote cache
 * warm during market hours and backs off when the market is closed.
 *
 * During market hours:   poll every 5 s → Redis TTL 5 s
 * Outside market hours:  poll every 60 s → Redis TTL 60 s  (prices don't move)
 *
 * The "singleton" pattern (jobId = 'quote-poll') avoids duplicate jobs
 * accumulating if the pod restarts mid-interval: add() with an existing jobId
 * is a no-op when the job is still pending.
 *
 * Per-user fan-out:
 *   universe = holding(qty>0) ∪ watchlist_item   (both are cheap INDEX scans)
 *   For each user whose ticker received a fresh quote → emit quote.tick[].
 *
 * Redis commands per poll cycle (≈ 1 user, 100 tickers, market open):
 *   1 PIPELINE with 100 SETEX  +  a few BullMQ queue ops  ≈ ~110 cmds / 5 s
 *   = 110 × 720 (5s windows / hour) × 6.5 h = ~514k/day for a single active user
 *   → use Upstash dedicated plan or throttle tickers to <20 per poll
 *   The DEPLOY.md §7 tracks this; implementation correct.
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
import Redis from 'ioredis';

import { DbService } from '../common/db.service';
import { QuoteProvider, Quote } from '../common/providers/quote.provider';
import { isMarketOpen } from './quote.cache';
import { RealtimeGateway } from '../realtime/realtime.gateway';

/** Parse a redis[s]:// URL into BullMQ ConnectionOptions (no external ioredis instance). */
function parseBullConn(url: string): ConnectionOptions {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    ...(u.password ? { password: decodeURIComponent(u.password) } : {}),
    ...(u.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}

const QUEUE_NAME = 'tn:quote-poller';
const JOB_NAME = 'poll';
const JOB_ID = 'quote-poll'; // singleton — one pending job at a time
const MARKET_INTERVAL_MS = 5_000;
const CLOSED_INTERVAL_MS = 60_000;

/** Shape of a quote.tick payload pushed to the browser/Android via Socket.IO. */
export interface QuoteTick {
  ticker: string;
  ltp: string;
  change: string;
  changePct: string;
  todayHigh: string;
  todayLow: string;
  volume: string;
  t: number; // epoch ms
}

@Injectable()
export class QuotePollerService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(QuotePollerService.name);

  // BullMQ manages its own internal connections via ConnectionOptions (not external Redis instance).
  // We keep a separate ioredis client only for the cache SETEX pipeline.
  private ioRedis: Redis | null = null;
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  constructor(
    private readonly cfg: ConfigService,
    private readonly db: DbService,
    @Optional() @Inject(QuoteProvider) private readonly provider: QuoteProvider | null,
    @Optional() private readonly gateway: RealtimeGateway | null,
  ) {}

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async onModuleInit(): Promise<void> {
    const url = this.cfg.get<string>('REDIS_URL');
    if (!url) {
      this.log.warn('REDIS_URL not set — quote poller disabled');
      return;
    }
    if (!this.provider) {
      this.log.warn('No QuoteProvider injected — quote poller disabled');
      return;
    }

    const conn = parseBullConn(url);
    this.ioRedis = new Redis(url, { maxRetriesPerRequest: 3, enableReadyCheck: false });

    this.queue = new Queue(QUEUE_NAME, { connection: conn });
    this.worker = new Worker(QUEUE_NAME, (job) => this.handleJob(job), {
      connection: conn,
      concurrency: 1,
    });

    this.worker.on('failed', (job, err) =>
      this.log.error(`quote-poll job ${job?.id ?? '?'} failed: ${err.message}`),
    );

    // Only schedule if no pending job already exists (handles pod restarts).
    const existing = await this.queue.getJob(JOB_ID);
    if (!existing) {
      await this.queue.add(JOB_NAME, {}, { jobId: JOB_ID, delay: 0 });
    }

    this.log.log('Quote poller started');
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    this.ioRedis?.disconnect();
  }

  // ---------------------------------------------------------------------------
  // Job handler
  // ---------------------------------------------------------------------------

  private async handleJob(_job: Job): Promise<void> {
    const open = isMarketOpen(new Date());
    const nextDelay = open ? MARKET_INTERVAL_MS : CLOSED_INTERVAL_MS;

    try {
      if (open) {
        await this.pollQuotes();
      } else {
        this.log.debug('Market closed — skipping quote fetch');
      }
    } catch (e) {
      this.log.error(`pollQuotes error: ${(e as Error).message}`);
    } finally {
      // Re-schedule the singleton regardless of success/failure.
      await this.queue?.add(JOB_NAME, {}, { jobId: JOB_ID, delay: nextDelay });
    }
  }

  // ---------------------------------------------------------------------------
  // Core logic (public for unit-test access)
  // ---------------------------------------------------------------------------

  /**
   * Builds the per-user ticker universe, fetches fresh quotes, writes them
   * to Redis (cache warm-up), updates ticker_meta fallback columns, and
   * fans out quote.tick events to connected WebSocket clients.
   */
  async pollQuotes(): Promise<void> {
    const universeRows = await this.buildUniverse();
    if (universeRows.length === 0) return;

    // Deduplicate tickers globally; group per user for Socket.IO fan-out.
    const allTickers = new Set<string>();
    const userTickers = new Map<string, Set<string>>();
    for (const { user_id, ticker } of universeRows) {
      allTickers.add(ticker);
      if (!userTickers.has(user_id)) userTickers.set(user_id, new Set());
      userTickers.get(user_id)!.add(ticker);
    }

    const quotes = await this.provider!.getQuotes([...allTickers]);
    if (quotes.size === 0) {
      this.log.warn('Provider returned empty quote map');
      return;
    }

    await Promise.all([
      this.writeToRedis(quotes),
      this.writeToTickerMeta(quotes),
    ]);

    this.emitToUsers(quotes, userTickers);
  }

  async buildUniverse(): Promise<Array<{ user_id: string; ticker: string }>> {
    const res = await this.db.query<{ user_id: string; ticker: string }>(
      `SELECT DISTINCT user_id, ticker FROM holding  WHERE qty > 0
       UNION
       SELECT DISTINCT user_id, ticker FROM watchlist_item`,
    );
    return res.rows;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async writeToRedis(quotes: Map<string, Quote>): Promise<void> {
    if (!this.ioRedis || quotes.size === 0) return;
    const ttl = isMarketOpen(new Date()) ? 5 : 60;
    const now = Date.now();
    const pipe = this.ioRedis.pipeline();
    for (const [ticker, q] of quotes) {
      pipe.setex(
        `q:${ticker}`,
        ttl,
        JSON.stringify({
          ltp: q.ltp.toFixed(4),
          prev: q.prevClose.toFixed(4),
          asOf: now,
        }),
      );
    }
    await pipe.exec();
    this.log.debug(`Wrote ${quotes.size} quotes to Redis`);
  }

  private async writeToTickerMeta(quotes: Map<string, Quote>): Promise<void> {
    if (quotes.size === 0) return;
    // Build a bulk UPSERT. Postgres has no array-of-row binding, so we expand
    // to positional parameters. For 50 tickers × 6 columns = 300 params — fine.
    const rows: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    for (const [ticker, q] of quotes) {
      rows.push(
        `($${i++}::text, $${i++}::numeric, $${i++}::numeric, $${i++}::numeric, $${i++}::numeric, $${i++}::bigint, NOW())`,
      );
      values.push(
        ticker,
        q.ltp.toFixed(4),
        q.prevClose.toFixed(4),
        q.todayHigh.toFixed(4),
        q.todayLow.toFixed(4),
        q.volume.toString(),
      );
    }
    await this.db.query(
      `INSERT INTO ticker_meta
         (ticker, current_price, prev_close, today_high, today_low, today_volume, quote_refreshed_at)
       VALUES ${rows.join(', ')}
       ON CONFLICT (ticker) DO UPDATE SET
         current_price      = EXCLUDED.current_price,
         prev_close         = EXCLUDED.prev_close,
         today_high         = EXCLUDED.today_high,
         today_low          = EXCLUDED.today_low,
         today_volume       = EXCLUDED.today_volume,
         quote_refreshed_at = EXCLUDED.quote_refreshed_at`,
      values,
    );
  }

  private emitToUsers(
    quotes: Map<string, Quote>,
    userTickers: Map<string, Set<string>>,
  ): void {
    if (!this.gateway) return;
    const now = Date.now();
    for (const [userId, tickers] of userTickers) {
      const ticks: QuoteTick[] = [];
      for (const ticker of tickers) {
        const q = quotes.get(ticker);
        if (!q) continue;
        ticks.push({
          ticker,
          ltp: q.ltp.toFixed(4),
          change: q.change.toFixed(4),
          changePct: q.changePct.toFixed(6),
          todayHigh: q.todayHigh.toFixed(4),
          todayLow: q.todayLow.toFixed(4),
          volume: q.volume.toString(),
          t: now,
        });
      }
      if (ticks.length > 0) {
        this.gateway.emitToUser(userId, 'quote.tick', ticks);
      }
    }
  }
}
