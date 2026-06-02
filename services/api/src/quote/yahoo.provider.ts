/**
 * Yahoo Finance adapter. The ONLY place we're allowed to import `yahoo-finance2`.
 *
 * Contract:
 *  - `getQuotes` accepts up to `batchLimit` tickers per call (we self-cap at 50);
 *    callers chunk above that.
 *  - `getMeta` reads `quoteSummary` modules: assetProfile + summaryDetail +
 *    defaultKeyStatistics + price.
 *  - All numeric values funneled through D(). Throws on missing required field
 *    (no silent zero-fills) — adapter test pins the contract.
 */
import { D } from '../common/types/money';
import {
  Quote,
  QuoteProvider,
  SearchHit,
  TickerMetaSnapshot,
} from '../common/providers/quote.provider';

// Minimal structural type for the upstream payloads we depend on. Pinned to
// the fixture; if Yahoo changes shape, the adapter test fails loudly.
export interface YahooQuoteShape {
  symbol: string;
  regularMarketPrice: number;
  regularMarketPreviousClose: number;
  regularMarketDayHigh: number;
  regularMarketDayLow: number;
  regularMarketVolume: number;
  currency: 'INR' | 'USD';
  regularMarketTime: number; // epoch seconds
}
export interface YahooQuoteSummaryShape {
  symbol: string;
  price: { longName?: string; shortName?: string };
  assetProfile?: { sector?: string; industry?: string };
  summaryDetail?: {
    trailingPE?: number;
    marketCap?: number;
    fiftyTwoWeekHigh?: number;
    fiftyTwoWeekLow?: number;
    averageVolume?: number;
  };
  defaultKeyStatistics?: { firstTradeDateEpochUtc?: number };
}

/** Yahoo /v1/finance/search response shape (only fields we depend on). */
export interface YahooSearchHitShape {
  symbol: string;
  shortname?: string;
  longname?: string;
  exchange?: string;       // e.g. 'NSI', 'BSE', 'NMS'
  exchDisp?: string;       // e.g. 'NSE', 'NASDAQ' — display name
  quoteType?: string;      // 'EQUITY', 'ETF', 'INDEX'
  typeDisp?: string;
  isYahooFinance?: boolean;
}

/**
 * Normalize Yahoo's mess of exchange codes into a single canonical value.
 *
 * Yahoo returns two fields: `exchange` (NSI, BSE, NMS, NYQ, ASE…) and
 * `exchDisp` (NSE, Bombay, NASDAQ, NYSE, AMEX…). They're inconsistent
 * across stocks — the suffix in the symbol itself is the only reliable
 * signal for India (.NS = NSE, .BO = BSE). For US, we use the codes.
 *
 * Returns one of: 'NSE' | 'BSE' | 'NASDAQ' | 'NYSE' | 'AMEX' | <raw>
 */
const normaliseExchange = (raw: YahooSearchHitShape): string => {
  const sym = raw.symbol ?? '';
  if (sym.endsWith('.NS')) return 'NSE';
  if (sym.endsWith('.BO')) return 'BSE';
  const ex = (raw.exchange ?? '').toUpperCase();
  const disp = (raw.exchDisp ?? '').toUpperCase();
  // US: rely on exchange code first (more stable), fall back to disp.
  if (ex === 'NMS' || ex === 'NGM' || ex === 'NCM' || disp === 'NASDAQ') return 'NASDAQ';
  if (ex === 'NYQ' || disp === 'NYSE') return 'NYSE';
  if (ex === 'ASE' || ex === 'PCX' || disp === 'AMEX' || disp === 'NYSEAMERICAN') return 'AMEX';
  // Other India-flavoured codes that may slip through without the suffix.
  if (ex === 'NSI' || disp === 'NSE') return 'NSE';
  if (ex === 'BSE' || ex === 'BSI' || ex === 'BOM' || disp === 'BOMBAY' || disp === 'BSE') return 'BSE';
  // Last resort — pass through the raw display so the UI at least shows
  // something instead of dropping the hit entirely.
  return raw.exchDisp ?? raw.exchange ?? '';
};

export const mapSearchHit = (raw: YahooSearchHitShape): SearchHit => ({
  ticker: raw.symbol,
  name: raw.longname ?? raw.shortname ?? raw.symbol,
  exchange: normaliseExchange(raw),
  quoteType: raw.quoteType ?? 'EQUITY',
});

export const mapQuote = (raw: YahooQuoteShape): Quote => {
  const ltp = D(raw.regularMarketPrice);
  const prev = D(raw.regularMarketPreviousClose);
  return {
    ticker: raw.symbol,
    ltp,
    prevClose: prev,
    change: ltp.sub(prev),
    changePct: prev.isZero() ? D(0) : ltp.sub(prev).div(prev),
    todayHigh: D(raw.regularMarketDayHigh),
    todayLow: D(raw.regularMarketDayLow),
    volume: BigInt(raw.regularMarketVolume),
    currency: raw.currency,
    asOf: new Date(raw.regularMarketTime * 1000),
  };
};

export const mapMeta = (raw: YahooQuoteSummaryShape): TickerMetaSnapshot => {
  const sd = raw.summaryDetail ?? {};
  const ap = raw.assetProfile ?? {};
  const ks = raw.defaultKeyStatistics ?? {};
  return {
    ticker: raw.symbol,
    name: raw.price.longName ?? raw.price.shortName ?? raw.symbol,
    sector: ap.sector ?? null,
    sectorDomain: ap.industry ?? null,
    marketType: classifyMarketCap(sd.marketCap),
    peRatio: sd.trailingPE != null ? D(sd.trailingPE) : null,
    marketCap: sd.marketCap != null ? D(sd.marketCap) : null,
    fiftyTwoWeekHigh:
      sd.fiftyTwoWeekHigh != null ? D(sd.fiftyTwoWeekHigh) : null,
    fiftyTwoWeekLow: sd.fiftyTwoWeekLow != null ? D(sd.fiftyTwoWeekLow) : null,
    avgVolume: sd.averageVolume != null ? BigInt(sd.averageVolume) : null,
    listingDate:
      ks.firstTradeDateEpochUtc != null
        ? new Date(ks.firstTradeDateEpochUtc * 1000)
        : null,
    indices: [], // resolved by ticker_meta enrichment job using sector + market cap
  };
};

const classifyMarketCap = (
  cap: number | undefined,
): TickerMetaSnapshot['marketType'] => {
  if (cap == null) return null;
  // Indian SEBI definition (approx): top 100 = Large, 101-250 = Mid,
  // remainder = Small. We approximate with absolute INR thresholds for now;
  // the daily enrichment job recomputes from the universe ranking.
  if (cap >= 200_000_000_000_0) return 'Large Cap'; // ~ 2 lakh crore
  if (cap >= 50_000_000_000_0) return 'Mid Cap'; // 50k crore
  if (cap >= 5_000_000_000_0) return 'Small Cap'; // 5k crore
  return 'Micro Cap';
};

export class YahooQuoteProvider extends QuoteProvider {
  readonly name = 'yahoo';
  readonly batchLimit = 50;

  // The actual `yahoo-finance2` / Yahoo HTTP calls are wired up in the
  // provider module; kept abstract here so the adapter test can stub them.
  constructor(
    private readonly fetchQuotes: (
      tickers: readonly string[],
    ) => Promise<YahooQuoteShape[]>,
    private readonly fetchSummaries: (
      tickers: readonly string[],
    ) => Promise<YahooQuoteSummaryShape[]>,
    private readonly fetchSearch: (
      query: string,
      limit: number,
    ) => Promise<YahooSearchHitShape[]> = async () => [],
  ) {
    super();
  }

  async getQuotes(tickers: readonly string[]): Promise<Map<string, Quote>> {
    const chunks = chunk(tickers, this.batchLimit);
    const out = new Map<string, Quote>();
    for (const c of chunks) {
      const raw = await this.fetchQuotes(c);
      for (const r of raw) out.set(r.symbol, mapQuote(r));
    }
    return out;
  }

  async getMeta(
    tickers: readonly string[],
  ): Promise<Map<string, TickerMetaSnapshot>> {
    const out = new Map<string, TickerMetaSnapshot>();
    const raws = await this.fetchSummaries(tickers);
    for (const r of raws) out.set(r.symbol, mapMeta(r));
    return out;
  }

  async search(query: string, limit = 10): Promise<SearchHit[]> {
    const trimmed = query.trim();
    if (trimmed.length < 1) return [];
    const raws = await this.fetchSearch(trimmed, limit);
    // Filter out non-equity/non-ETF noise (PRIVATE COMPANIES, FUTURES, etc.)
    return raws
      .filter((r) => {
        const t = (r.quoteType ?? '').toUpperCase();
        return t === 'EQUITY' || t === 'ETF' || t === 'INDEX' || t === 'MUTUALFUND';
      })
      .slice(0, limit)
      .map(mapSearchHit);
  }
}

const chunk = <T>(xs: readonly T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
};
