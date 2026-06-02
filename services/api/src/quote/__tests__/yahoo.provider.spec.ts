import { mapMeta, mapQuote, YahooQuoteProvider } from '../yahoo.provider';
import { FIXTURE_QUOTE_INFY, FIXTURE_SUMMARY_INFY } from './yahoo.fixtures';

describe('YahooQuoteProvider — adapter contract', () => {
  describe('mapQuote', () => {
    it('maps a recorded INFY payload to the canonical Quote shape', () => {
      const q = mapQuote(FIXTURE_QUOTE_INFY);
      expect(q.ticker).toBe('INFY.NS');
      expect(q.ltp.toString()).toBe('1602.5');
      expect(q.prevClose.toString()).toBe('1580');
      expect(q.change.toString()).toBe('22.5');
      expect(q.changePct.toFixed(6)).toBe('0.014241');
      expect(q.currency).toBe('INR');
      expect(q.volume).toBe(6371871n);
    });

    it('does not divide by zero on prevClose=0', () => {
      const q = mapQuote({
        ...FIXTURE_QUOTE_INFY,
        regularMarketPreviousClose: 0,
      });
      expect(q.changePct.toString()).toBe('0');
    });
  });

  describe('mapMeta', () => {
    it('maps quoteSummary for INFY into TickerMetaSnapshot', () => {
      const m = mapMeta(FIXTURE_SUMMARY_INFY);
      expect(m.name).toBe('Infosys Limited');
      expect(m.sector).toBe('Technology');
      expect(m.sectorDomain).toBe('Information Technology Services');
      expect(m.peRatio!.toString()).toBe('24.31');
      expect(m.fiftyTwoWeekHigh!.toString()).toBe('1728');
      expect(m.marketType).toBe('Large Cap');
    });

    it('null-safe when modules are absent', () => {
      const m = mapMeta({
        symbol: 'X',
        price: { shortName: 'X Co' },
      });
      expect(m.sector).toBeNull();
      expect(m.peRatio).toBeNull();
      expect(m.marketType).toBeNull();
      expect(m.indices).toEqual([]);
    });
  });

  describe('search', () => {
    it('maps Yahoo /v1/finance/search hits and prefers longname', async () => {
      const provider = new YahooQuoteProvider(
        async () => [],
        async () => [],
        async () => [
          {
            symbol: 'RELIANCE.NS',
            shortname: 'RELIANCE INDS',
            longname: 'Reliance Industries Limited',
            exchange: 'NSI',
            exchDisp: 'NSE',
            quoteType: 'EQUITY',
          },
          {
            symbol: 'RELI',
            shortname: 'Reli, Inc.',
            exchange: 'OQB',
            exchDisp: 'OTC',
            quoteType: 'EQUITY',
          },
        ],
      );
      const out = await provider.search('reliance');
      expect(out).toHaveLength(2);
      expect(out[0]!.ticker).toBe('RELIANCE.NS');
      expect(out[0]!.name).toBe('Reliance Industries Limited');
      expect(out[0]!.exchange).toBe('NSE');
      expect(out[1]!.name).toBe('Reli, Inc.');
    });

    it('filters out non-equity/non-ETF noise (PRIVATECOMPANY, FUTURE, …)', async () => {
      const provider = new YahooQuoteProvider(
        async () => [],
        async () => [],
        async () => [
          { symbol: 'AAA', quoteType: 'EQUITY', shortname: 'A Co' },
          { symbol: 'BBB', quoteType: 'PRIVATECOMPANY', shortname: 'B Co' },
          { symbol: 'CCC', quoteType: 'FUTURE', shortname: 'C Future' },
          { symbol: 'DDD', quoteType: 'ETF', shortname: 'D ETF' },
        ],
      );
      const out = await provider.search('a');
      expect(out.map((h) => h.ticker).sort()).toEqual(['AAA', 'DDD']);
    });

    it('normalises BSE (.BO) hits regardless of upstream exchange/exchDisp', async () => {
      // Real-world Yahoo response for YSL.BO has exchange=BSE / exchDisp=Bombay,
      // while RELIANCE.NS comes back as exchange=NSI / exchDisp=NSE. Both must
      // map to clean codes the UI knows about.
      const provider = new YahooQuoteProvider(
        async () => [],
        async () => [],
        async () => [
          {
            symbol: 'YSL.BO',
            shortname: 'The Yamuna Syndicate Ltd',
            longname: 'The Yamuna Syndicate Limited',
            exchange: 'BSE',
            exchDisp: 'Bombay',
            quoteType: 'EQUITY',
          },
          {
            symbol: 'RELIANCE.NS',
            longname: 'Reliance Industries Limited',
            exchange: 'NSI',
            exchDisp: 'NSE',
            quoteType: 'EQUITY',
          },
          {
            symbol: 'AAPL',
            longname: 'Apple Inc.',
            exchange: 'NMS',
            exchDisp: 'NasdaqGS',
            quoteType: 'EQUITY',
          },
        ],
      );
      const out = await provider.search('a');
      const byTicker = new Map(out.map((h) => [h.ticker, h.exchange]));
      expect(byTicker.get('YSL.BO')).toBe('BSE');
      expect(byTicker.get('RELIANCE.NS')).toBe('NSE');
      expect(byTicker.get('AAPL')).toBe('NASDAQ');
    });

    it('returns [] for blank query without hitting upstream', async () => {
      let called = false;
      const provider = new YahooQuoteProvider(
        async () => [],
        async () => [],
        async () => {
          called = true;
          return [];
        },
      );
      const out = await provider.search('   ');
      expect(out).toEqual([]);
      expect(called).toBe(false);
    });
  });

  describe('batching', () => {
    it('caps each upstream call to batchLimit (50)', async () => {
      const calls: number[] = [];
      const provider = new YahooQuoteProvider(
        async (tickers) => {
          calls.push(tickers.length);
          return tickers.map((s) => ({ ...FIXTURE_QUOTE_INFY, symbol: s }));
        },
        async () => [],
      );
      const universe = Array.from({ length: 120 }, (_, i) => `T${i}`);
      const out = await provider.getQuotes(universe);
      expect(calls).toEqual([50, 50, 20]);
      expect(out.size).toBe(120);
    });
  });
});
