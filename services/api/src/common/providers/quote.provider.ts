/**
 * THE single seam to the world for equity quotes.
 * Implementations: YahooQuoteProvider (default), FinnhubQuoteProvider (fallback),
 *   GoogleFinanceScraper (phase-2 - off by default), FixtureQuoteProvider (tests).
 *
 * Never invent fields. Every implementation must be backed by recorded fixtures
 * in test/fixtures/<provider>-<ticker>.json so the contract is testable.
 */

import { Money } from '../types/money';

export interface Quote {
  ticker: string;
  ltp: Money; // last traded price
  prevClose: Money;
  change: Money; // ltp - prevClose
  changePct: Money; // (ltp - prevClose) / prevClose
  todayHigh: Money;
  todayLow: Money;
  volume: bigint;
  asOf: Date;
  currency: 'INR' | 'USD';
}

export interface TickerMetaSnapshot {
  ticker: string;
  name: string;
  sector: string | null;
  sectorDomain: string | null;
  marketType: 'Large Cap' | 'Mid Cap' | 'Small Cap' | 'Micro Cap' | 'ETF' | null;
  peRatio: Money | null;
  marketCap: Money | null;
  fiftyTwoWeekHigh: Money | null;
  fiftyTwoWeekLow: Money | null;
  avgVolume: bigint | null;
  listingDate: Date | null;
  indices: string[]; // ['NIFTY 50', 'NIFTY 500', ...]
}

export interface SearchHit {
  ticker: string;       // 'RELIANCE.NS'
  name: string;         // 'Reliance Industries Ltd'
  exchange: string;     // 'NSE', 'BSE', 'NASDAQ', …
  quoteType: string;    // 'EQUITY', 'ETF', 'INDEX', …
}

export abstract class QuoteProvider {
  /** Batched quote read; implementations MUST cap batch size to their provider limit. */
  abstract getQuotes(tickers: readonly string[]): Promise<Map<string, Quote>>;

  /** Daily enrichment fetch; safe to call infrequently (rate-limited). */
  abstract getMeta(tickers: readonly string[]): Promise<Map<string, TickerMetaSnapshot>>;

  /** Free-text search → ticker suggestions, ranked by Yahoo. */
  abstract search(query: string, limit?: number): Promise<SearchHit[]>;

  /** Provider name for telemetry/audit. */
  abstract readonly name: string;

  /** Max tickers per batched request; the poller respects this. */
  abstract readonly batchLimit: number;
}
