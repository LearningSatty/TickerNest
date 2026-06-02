import { Module } from '@nestjs/common';
import { QuoteCache } from './quote.cache';
import { QuotePollerService } from './quote.poller';
import { QuoteSearchController } from './quote-search.controller';
import { TickerMetaEnricher } from './ticker-meta.enricher';
import {
  YahooQuoteProvider,
  YahooQuoteShape,
  YahooQuoteSummaryShape,
  YahooSearchHitShape,
} from './yahoo.provider';
import { QuoteProvider } from '../common/providers/quote.provider';
import { RealtimeModule } from '../realtime/realtime.module';

/**
 * Provider wiring. The Yahoo adapter is the default but lives behind the
 * QuoteProvider abstract class so swap-in (Finnhub etc.) is a config flip.
 *
 * We import yahoo-finance2 lazily — its types are CJS/ESM-mixed and we don't
 * need it at build time for the unit tests.
 */
@Module({
  imports: [RealtimeModule],
  providers: [
    {
      provide: QuoteProvider,
      useFactory: async () => {
        // We bypass yahoo-finance2's `quote()` because it requires a cookie/crumb
        // handshake that fails on Node <18.14 (response.headers.getSetCookie
        // is not a function).  The public chart endpoint serves the same data
        // and needs no cookies.
        //
        // For each ticker → GET /v8/finance/chart/<symbol>?range=5d&interval=1d
        //   → meta.regularMarketPrice + meta.chartPreviousClose are exactly
        //     what mapQuote() needs.  We chunk in parallel (5 at a time) to
        //     stay under Yahoo's informal rate limits.
        const fetchQuotes = async (
          tickers: readonly string[],
        ): Promise<YahooQuoteShape[]> => {
          const out: YahooQuoteShape[] = [];
          const inflight: Promise<void>[] = [];
          const PARALLEL = 5;
          for (let i = 0; i < tickers.length; i += PARALLEL) {
            const batch = tickers.slice(i, i + PARALLEL);
            await Promise.all(
              batch.map(async (ticker) => {
                // We use range=5d so the response includes a multi-day
                // series.  Why: for futures/commodities/crypto on weekends
                // (NQ=F, GC=F, BZ=F, BTC-USD), Yahoo's `chartPreviousClose`
                // with range=1d equals `regularMarketPrice` (both are the
                // last close), making Δ = 0.  The series approach pulls
                // yesterday's close from `series[-2]` regardless — same
                // value that finance.yahoo.com displays.
                const url =
                  `https://query1.finance.yahoo.com/v8/finance/chart/` +
                  `${encodeURIComponent(ticker)}?range=5d&interval=1d`;
                try {
                  const r = await fetch(url, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (TickerNest)' },
                  });
                  if (!r.ok) return;
                  const body = (await r.json()) as {
                    chart?: {
                      result?: Array<{
                        meta?: Record<string, unknown>;
                        timestamp?: number[];
                        indicators?: { quote?: Array<{ close?: (number | null)[] }> };
                      }>;
                    };
                  };
                  const result = body.chart?.result?.[0];
                  if (!result) return;
                  const meta = (result.meta ?? {}) as Record<string, unknown>;
                  const closes = (result.indicators?.quote?.[0]?.close ?? []).filter(
                    (x): x is number => typeof x === 'number',
                  );

                  const ltp = Number(meta['regularMarketPrice'] ?? 0);

                  // Derive yesterday's close = last fully-closed daily candle
                  // BEFORE the current LTP.  We use the second-to-last series
                  // value, falling back through previousClose / chartPreviousClose.
                  let prev = 0;
                  if (closes.length >= 2) {
                    // The last point in the series IS today's close (or the
                    // current intraday print on equities), the one before
                    // it is yesterday.
                    prev = closes[closes.length - 2]!;
                  } else if (typeof meta['previousClose'] === 'number') {
                    prev = meta['previousClose'] as number;
                  } else if (typeof meta['chartPreviousClose'] === 'number') {
                    prev = meta['chartPreviousClose'] as number;
                  }

                  const high = Number(meta['regularMarketDayHigh'] ?? ltp);
                  const low = Number(meta['regularMarketDayLow'] ?? ltp);
                  const volume = Number(meta['regularMarketVolume'] ?? 0);
                  const currency = meta['currency'] === 'USD' ? 'USD' : 'INR';
                  const t =
                    Number(meta['regularMarketTime']) ||
                    Math.floor(Date.now() / 1000);
                  out.push({
                    symbol: String(meta['symbol'] ?? ticker),
                    regularMarketPrice: ltp,
                    regularMarketPreviousClose: prev,
                    regularMarketDayHigh: high,
                    regularMarketDayLow: low,
                    regularMarketVolume: volume,
                    currency,
                    regularMarketTime: t,
                  });
                } catch {
                  /* skip — the cache will fall back to ticker_meta */
                }
              }),
            );
          }
          void inflight;
          return out;
        };
        // Lazy-import yahoo-finance2 only for `quoteSummary` (used by the
        // daily ticker_meta enricher). On Node <18.14 this also throws on
        // first call due to the cookie/crumb handshake — when that happens
        // the enricher logs and skips the ticker, no UI impact.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const yfMod = await import('yahoo-finance2');
        const yf = (yfMod as unknown as { default: typeof yfMod }).default ?? yfMod;
        const fetchSummaries = async (
          tickers: readonly string[],
        ): Promise<YahooQuoteSummaryShape[]> => {
          const out: YahooQuoteSummaryShape[] = [];
          for (const t of tickers) {
            try {
              const s = (await (yf as unknown as {
                quoteSummary: (s: string, opts: unknown) => Promise<unknown>;
              }).quoteSummary(t, {
                modules: ['price', 'assetProfile', 'summaryDetail', 'defaultKeyStatistics'],
              })) as Record<string, unknown>;
              const price = (s['price'] ?? {}) as Record<string, unknown>;
              const ap = (s['assetProfile'] ?? {}) as Record<string, unknown>;
              const sd = (s['summaryDetail'] ?? {}) as Record<string, unknown>;
              const ks = (s['defaultKeyStatistics'] ?? {}) as Record<string, unknown>;
              const longName = price['longName'] as string | undefined;
              const shortName = price['shortName'] as string | undefined;
              const sector = ap['sector'] as string | undefined;
              const industry = ap['industry'] as string | undefined;
              const trailingPE = sd['trailingPE'] as number | undefined;
              const marketCap = sd['marketCap'] as number | undefined;
              const fiftyTwoWeekHigh = sd['fiftyTwoWeekHigh'] as number | undefined;
              const fiftyTwoWeekLow = sd['fiftyTwoWeekLow'] as number | undefined;
              const averageVolume = sd['averageVolume'] as number | undefined;
              const firstTradeDateEpochUtc = ks['firstTradeDateEpochUtc'] as number | undefined;
              out.push({
                symbol: t,
                price: {
                  ...(longName !== undefined && { longName }),
                  ...(shortName !== undefined && { shortName }),
                },
                assetProfile: {
                  ...(sector !== undefined && { sector }),
                  ...(industry !== undefined && { industry }),
                },
                summaryDetail: {
                  ...(trailingPE !== undefined && { trailingPE }),
                  ...(marketCap !== undefined && { marketCap }),
                  ...(fiftyTwoWeekHigh !== undefined && { fiftyTwoWeekHigh }),
                  ...(fiftyTwoWeekLow !== undefined && { fiftyTwoWeekLow }),
                  ...(averageVolume !== undefined && { averageVolume }),
                },
                defaultKeyStatistics: {
                  ...(firstTradeDateEpochUtc !== undefined && { firstTradeDateEpochUtc }),
                },
              });
            } catch {
              /* skip — meta is best-effort */
            }
          }
          return out;
        };
        // Yahoo's public search endpoint requires no cookie/crumb handshake,
        // so we call it directly via fetch — bypasses the broken yahoo-finance2
        // v2 path on Node <18.14.
        const fetchSearch = async (
          query: string,
          limit: number,
        ): Promise<YahooSearchHitShape[]> => {
          const url =
            `https://query2.finance.yahoo.com/v1/finance/search` +
            `?q=${encodeURIComponent(query)}` +
            `&quotesCount=${Math.min(limit, 25)}` +
            `&newsCount=0&listsCount=0`;
          const r = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (TickerNest)' },
          });
          if (!r.ok) return [];
          const body = (await r.json()) as { quotes?: YahooSearchHitShape[] };
          return body.quotes ?? [];
        };
        return new YahooQuoteProvider(fetchQuotes, fetchSummaries, fetchSearch);
      },
    },
    QuoteCache,
    QuotePollerService,
    TickerMetaEnricher,
  ],
  controllers: [QuoteSearchController],
  exports: [QuoteProvider, QuoteCache, QuotePollerService, TickerMetaEnricher],
})
export class QuoteModule {}
