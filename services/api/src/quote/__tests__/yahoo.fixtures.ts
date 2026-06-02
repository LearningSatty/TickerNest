/**
 * Recorded Yahoo payloads. These are the contracts we depend on. If
 * `yahoo-finance2` upstream changes shape, the adapter test fails loudly
 * and we update the fixture here intentionally — never silently.
 *
 * Source: yahoo-finance2 v2.13 against INFY.NS and AAPL on 2026-01-15.
 */
import { YahooQuoteShape, YahooQuoteSummaryShape } from '../yahoo.provider';

export const FIXTURE_QUOTE_INFY: YahooQuoteShape = {
  symbol: 'INFY.NS',
  regularMarketPrice: 1602.5,
  regularMarketPreviousClose: 1580.0,
  regularMarketDayHigh: 1610.0,
  regularMarketDayLow: 1575.0,
  regularMarketVolume: 6_371_871,
  currency: 'INR',
  regularMarketTime: 1768547700, // 2026-01-15 15:30 IST
};

export const FIXTURE_SUMMARY_INFY: YahooQuoteSummaryShape = {
  symbol: 'INFY.NS',
  price: { longName: 'Infosys Limited', shortName: 'INFOSYS LTD' },
  assetProfile: { sector: 'Technology', industry: 'Information Technology Services' },
  summaryDetail: {
    trailingPE: 24.31,
    marketCap: 6_700_000_000_000,
    fiftyTwoWeekHigh: 1728.0,
    fiftyTwoWeekLow: 1089.0,
    averageVolume: 13_145_335,
  },
  defaultKeyStatistics: { firstTradeDateEpochUtc: 829411800 },
};
