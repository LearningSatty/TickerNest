/**
 * Quote cache: read-through Redis with a 5-second TTL during market hours
 * and 60-second TTL otherwise. Falls back to ticker_meta.current_price
 * (last known) when the provider is rate-limited or down.
 *
 * This is the single read path for any service that needs LTP.
 */
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { D, Money } from '../common/types/money';
import { DbService } from '../common/db.service';
import { QuoteProvider } from '../common/providers/quote.provider';

interface CachedQuote {
  ltp: string;
  prev: string;
  asOf: number;
}

@Injectable()
export class QuoteCache {
  private readonly log = new Logger(QuoteCache.name);
  private readonly redis: Redis | null;

  constructor(
    cfg: ConfigService,
    @Optional() @Inject(QuoteProvider) private readonly provider: QuoteProvider | null,
    private readonly db: DbService,
  ) {
    const url = cfg.get<string>('REDIS_URL');
    this.redis = url ? new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 3 }) : null;
    if (!this.redis) this.log.warn('REDIS_URL unset; quote cache disabled');
  }

  /**
   * Get quotes for the given tickers. Returns Map<ticker, {ltp, prevClose}>.
   * Missing tickers simply do not appear in the map; we never throw on a
   * single-ticker miss.
   */
  async getMany(
    tickers: readonly string[],
  ): Promise<Map<string, { ltp: Money; prevClose: Money }>> {
    if (tickers.length === 0) return new Map();
    const out = new Map<string, { ltp: Money; prevClose: Money }>();
    const missing: string[] = [];

    if (this.redis) {
      const pipe = this.redis.pipeline();
      for (const t of tickers) pipe.get(this.key(t));
      const res = await pipe.exec();
      tickers.forEach((t, i) => {
        const raw = res?.[i]?.[1] as string | null | undefined;
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as CachedQuote;
            out.set(t, { ltp: D(parsed.ltp), prevClose: D(parsed.prev) });
            return;
          } catch { /* fall through to provider */ }
        }
        missing.push(t);
      });
    } else {
      missing.push(...tickers);
    }

    if (missing.length > 0 && this.provider) {
      try {
        const fresh = await this.provider.getQuotes(missing);
        for (const [t, q] of fresh) {
          out.set(t, { ltp: q.ltp, prevClose: q.prevClose });
          if (this.redis) {
            await this.redis.setex(
              this.key(t),
              this.ttlSeconds(),
              JSON.stringify({ ltp: q.ltp.toFixed(4), prev: q.prevClose.toFixed(4), asOf: Date.now() }),
            );
          }
        }
        const stillMissing = missing.filter((t) => !out.has(t));
        if (stillMissing.length > 0) await this.fillFromMeta(stillMissing, out);
      } catch (e) {
        this.log.warn(`provider failed: ${(e as Error).message}; falling back to ticker_meta`);
        await this.fillFromMeta(missing, out);
      }
    } else if (missing.length > 0) {
      await this.fillFromMeta(missing, out);
    }
    return out;
  }

  async getOne(ticker: string): Promise<{ ltp: Money; prevClose: Money } | null> {
    const m = await this.getMany([ticker]);
    return m.get(ticker) ?? null;
  }

  private async fillFromMeta(
    tickers: readonly string[],
    out: Map<string, { ltp: Money; prevClose: Money }>,
  ) {
    if (tickers.length === 0) return;
    const r = await this.db.query<{ ticker: string; current_price: string | null; prev_close: string | null }>(
      `SELECT ticker, current_price, prev_close
         FROM ticker_meta
        WHERE ticker = ANY($1)`,
      [tickers as unknown[]],
    );
    for (const row of r.rows) {
      out.set(row.ticker, {
        ltp: D(row.current_price ?? '0'),
        prevClose: D(row.prev_close ?? '0'),
      });
    }
  }

  private ttlSeconds(): number {
    return isMarketOpen(new Date()) ? 5 : 60;
  }

  private key(ticker: string): string {
    return `q:${ticker}`;
  }
}

/** NSE/BSE market hours: Mon-Fri 09:15 to 15:30 IST. */
export function isMarketOpen(now: Date): boolean {
  const ist = new Date(now.getTime() + (5.5 * 60 - now.getTimezoneOffset()) * 60_000);
  const dow = ist.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return minutes >= 9 * 60 + 15 && minutes <= 15 * 60 + 30;
}
