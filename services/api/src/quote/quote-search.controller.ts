/**
 * Quote endpoints — autocomplete, ticker detail, chart, and per-ticker news.
 *
 * Endpoints
 *   GET /quotes/search?q=<text>&limit=10           → SearchHit[]
 *   GET /quotes/:ticker                            → StockDetail
 *   GET /quotes/:ticker/chart?range=1d|5d|1mo…     → ChartSeries
 *   GET /quotes/:ticker/news?limit=10              → NewsItem[]
 *
 * Everything is best-effort: when Yahoo's public chart endpoint doesn't
 * include a field (PE, website, etc.) the response returns null and the UI
 * shows "—" instead.
 */
import {
  Controller,
  Get,
  Inject,
  Optional,
  Param,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { QuoteProvider, SearchHit } from '../common/providers/quote.provider';

const CACHE_TTL_S = 60;
const DETAIL_CACHE_TTL_S = 300;
const NEWS_CACHE_TTL_S = 300;
const ALLOWED_RANGES = ['1d', '5d', '1mo', '3mo', '6mo', '1y', '5y', 'max'] as const;
type ChartRange = (typeof ALLOWED_RANGES)[number];

interface ChartSeriesPoint { t: number; close: number | null }
interface ChartSeries {
  ticker: string;
  range: ChartRange;
  currency: string;
  points: ChartSeriesPoint[];
  /** Single horizontal reference line shown on the chart (chartPreviousClose). */
  prevClose: number | null;
}

interface StockDetail {
  ticker: string;
  longName: string;
  shortName: string;
  exchange: string;
  currency: string;
  currentPrice: number;
  prevClose: number;
  dayChange: number;
  dayChangePct: number;
  dayHigh: number | null;
  dayLow: number | null;
  yearHigh: number | null;
  yearLow: number | null;
  /** From quoteSummary if available; otherwise null. */
  peRatio: number | null;
  marketCap: number | null;
  website: string | null;
  sector: string | null;
  industry: string | null;
}

interface NewsItem {
  title: string;
  publisher: string;
  publishedAt: number;
  link: string;
}

@Controller('quotes')
export class QuoteSearchController {
  private readonly redis: Redis | null;

  constructor(
    cfg: ConfigService,
    @Optional() @Inject(QuoteProvider) private readonly provider: QuoteProvider | null,
  ) {
    const url = cfg.get<string>('REDIS_URL');
    this.redis = url
      ? new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 3 })
      : null;
  }

  // ── Autocomplete ────────────────────────────────────────────────────────────
  @Get('search')
  async search(
    @Req() req: { user?: { id: string } },
    @Query('q') q = '',
    @Query('limit') limitStr = '10',
  ): Promise<SearchHit[]> {
    if (!req.user) throw new UnauthorizedException();
    const query = (q ?? '').trim();
    if (query.length < 1) return [];
    const limit = Math.min(Math.max(parseInt(limitStr, 10) || 10, 1), 25);

    const cacheKey = `tn:search:${query.toLowerCase()}:${limit}`;
    if (this.redis) {
      const hit = await this.redis.get(cacheKey);
      if (hit) {
        try {
          return JSON.parse(hit) as SearchHit[];
        } catch {
          /* corrupt — fall through */
        }
      }
    }

    if (!this.provider) return [];
    const results = await this.provider.search(query, limit);
    if (this.redis && results.length > 0) {
      await this.redis.setex(cacheKey, CACHE_TTL_S, JSON.stringify(results));
    }
    return results;
  }

  // ── Stock detail (single ticker snapshot) ───────────────────────────────────
  @Get(':ticker')
  async detail(
    @Req() req: { user?: { id: string } },
    @Param('ticker') ticker: string,
  ): Promise<StockDetail> {
    if (!req.user) throw new UnauthorizedException();
    const t = ticker.toUpperCase();
    const cacheKey = `tn:detail:${t}`;

    if (this.redis) {
      const hit = await this.redis.get(cacheKey);
      if (hit) {
        try { return JSON.parse(hit) as StockDetail; } catch { /* fall */ }
      }
    }

    // Two parallel fetches:
    //   range=1y  → for fiftyTwoWeekHigh/Low + name + exchange (meta).
    //   range=5d  → so series[-2] gives us yesterday's true close.
    //               (range=1y's chartPreviousClose is the close from a YEAR
    //                ago; using it as `prevClose` was the bug behind 1D
    //                showing -6.77% instead of the real -2.12%.)
    const fetchYahoo = async (range: string) => {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(t)}?interval=1d&range=${range}`;
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (TickerNest)' },
      });
      if (!r.ok) throw new Error(`Upstream HTTP ${r.status}`);
      return (await r.json()) as {
        chart?: {
          result?: Array<{
            meta?: Record<string, unknown>;
            indicators?: { quote?: Array<{ close?: (number | null)[] }> };
          }>;
        };
      };
    };
    const [bodyYear, body5d] = await Promise.all([fetchYahoo('1y'), fetchYahoo('5d')]);

    const meta = bodyYear.chart?.result?.[0]?.meta ?? {};
    const num = (k: string): number | null => {
      const v = meta[k];
      return typeof v === 'number' ? v : null;
    };
    const str = (k: string): string => {
      const v = meta[k];
      return typeof v === 'string' ? v : '';
    };

    const ltp = num('regularMarketPrice') ?? 0;

    // Prefer series[-2] from the 5-day fetch; fall back to meta values.
    const closes5d = (body5d.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? []).filter(
      (x): x is number => typeof x === 'number',
    );
    let prev = 0;
    if (closes5d.length >= 2) {
      prev = closes5d[closes5d.length - 2]!;
    } else {
      const meta5d = body5d.chart?.result?.[0]?.meta ?? {};
      const fromMeta5d =
        typeof meta5d['previousClose'] === 'number' ? (meta5d['previousClose'] as number) :
        typeof meta5d['chartPreviousClose'] === 'number' ? (meta5d['chartPreviousClose'] as number) :
        null;
      prev = fromMeta5d ?? num('previousClose') ?? num('chartPreviousClose') ?? 0;
    }

    const change = ltp - prev;
    const changePct = prev === 0 ? 0 : change / prev;

    const detail: StockDetail = {
      ticker: str('symbol') || t,
      longName: str('longName') || str('shortName') || t,
      shortName: str('shortName') || t,
      exchange: str('fullExchangeName') || str('exchangeName'),
      currency: str('currency') || 'INR',
      currentPrice: ltp,
      prevClose: prev,
      dayChange: change,
      dayChangePct: changePct,
      dayHigh: num('regularMarketDayHigh'),
      dayLow: num('regularMarketDayLow'),
      yearHigh: num('fiftyTwoWeekHigh'),
      yearLow: num('fiftyTwoWeekLow'),
      // quoteSummary is gated by Yahoo's crumb; not available without auth.
      peRatio: null,
      marketCap: null,
      website: null,
      sector: null,
      industry: null,
    };

    if (this.redis) {
      await this.redis.setex(cacheKey, DETAIL_CACHE_TTL_S, JSON.stringify(detail));
    }
    return detail;
  }

  // ── Chart series for one ticker over a given range ──────────────────────────
  @Get(':ticker/chart')
  async chart(
    @Req() req: { user?: { id: string } },
    @Param('ticker') ticker: string,
    @Query('range') rangeStr = '1mo',
  ): Promise<ChartSeries> {
    if (!req.user) throw new UnauthorizedException();
    const t = ticker.toUpperCase();
    const range = (ALLOWED_RANGES as readonly string[]).includes(rangeStr)
      ? (rangeStr as ChartRange)
      : '1mo';

    // Choose interval per range to balance density vs payload size.
    const interval = pickInterval(range);

    const cacheKey = `tn:chart:${t}:${range}`;
    if (this.redis) {
      const hit = await this.redis.get(cacheKey);
      if (hit) {
        try { return JSON.parse(hit) as ChartSeries; } catch { /* fall */ }
      }
    }

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(t)}?range=${range}&interval=${interval}`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (TickerNest)' },
    });
    if (!r.ok) throw new Error(`Upstream HTTP ${r.status}`);
    const body = (await r.json()) as {
      chart?: {
        result?: Array<{
          timestamp?: number[];
          meta?: Record<string, unknown>;
          indicators?: { quote?: Array<{ close?: (number | null)[] }> };
        }>;
      };
    };
    const result = body.chart?.result?.[0];
    if (!result) throw new Error('no chart data');
    const ts = result.timestamp ?? [];
    const closes = result.indicators?.quote?.[0]?.close ?? [];
    const points: ChartSeriesPoint[] = ts.map((t2, i) => ({
      t: t2,
      close: typeof closes[i] === 'number' ? closes[i]! : null,
    }));
    const meta = result.meta ?? {};
    const series: ChartSeries = {
      ticker: typeof meta['symbol'] === 'string' ? (meta['symbol'] as string) : t,
      range,
      currency: typeof meta['currency'] === 'string' ? (meta['currency'] as string) : 'INR',
      points,
      prevClose:
        typeof meta['chartPreviousClose'] === 'number'
          ? (meta['chartPreviousClose'] as number)
          : null,
    };

    if (this.redis) {
      // Short TTL during market hours; longer otherwise.  Use 60s default.
      await this.redis.setex(cacheKey, 60, JSON.stringify(series));
    }
    return series;
  }

  // ── Per-ticker news ─────────────────────────────────────────────────────────
  @Get(':ticker/news')
  async tickerNews(
    @Req() req: { user?: { id: string } },
    @Param('ticker') ticker: string,
    @Query('limit') limitStr = '10',
  ): Promise<NewsItem[]> {
    if (!req.user) throw new UnauthorizedException();
    const t = ticker.toUpperCase();
    const limit = Math.min(Math.max(parseInt(limitStr, 10) || 10, 1), 25);

    const cacheKey = `tn:news:${t}:${limit}`;
    if (this.redis) {
      const hit = await this.redis.get(cacheKey);
      if (hit) {
        try { return JSON.parse(hit) as NewsItem[]; } catch { /* fall */ }
      }
    }

    const url =
      `https://query2.finance.yahoo.com/v1/finance/search` +
      `?q=${encodeURIComponent(t)}&newsCount=${limit}&quotesCount=0&listsCount=0`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (TickerNest)' },
    });
    if (!r.ok) return [];
    const body = (await r.json()) as {
      news?: Array<{
        uuid?: string;
        title?: string;
        publisher?: string;
        providerPublishTime?: number;
        link?: string;
      }>;
    };
    const items: NewsItem[] = (body.news ?? [])
      .filter((n) => n.title && n.link)
      .map((n) => ({
        title: n.title!,
        publisher: n.publisher ?? '',
        publishedAt: n.providerPublishTime ?? 0,
        link: n.link!,
      }))
      .sort((a, b) => b.publishedAt - a.publishedAt)
      .slice(0, limit);

    if (this.redis) {
      await this.redis.setex(cacheKey, NEWS_CACHE_TTL_S, JSON.stringify(items));
    }
    return items;
  }
}

function pickInterval(range: ChartRange): string {
  switch (range) {
    case '1d':  return '5m';
    case '5d':  return '15m';
    case '1mo': return '1d';
    case '3mo': return '1d';
    case '6mo': return '1d';
    case '1y':  return '1d';
    case '5y':  return '1wk';
    case 'max': return '1mo';
  }
}
