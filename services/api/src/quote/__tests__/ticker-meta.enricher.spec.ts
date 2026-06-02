/**
 * Unit tests for TickerMetaEnricher.
 *
 * Like the poller tests, we skip onModuleInit and directly test the public
 * business logic (buildUniverse shape, upsertMeta SQL, rate-limited loop).
 */
import { TickerMetaEnricher } from '../ticker-meta.enricher';
import { TickerMetaSnapshot } from '../../common/providers/quote.provider';
import { D } from '../../common/types/money';
import { ConfigService } from '@nestjs/config';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeSnap(
  ticker: string,
  overrides: Partial<TickerMetaSnapshot> = {},
): TickerMetaSnapshot {
  return {
    ticker,
    name: `${ticker} Limited`,
    sector: 'Technology',
    sectorDomain: 'IT Services',
    marketType: 'Large Cap',
    peRatio: D('25.5'),
    marketCap: D('6000000000000'),
    fiftyTwoWeekHigh: D('1800'),
    fiftyTwoWeekLow: D('1200'),
    avgVolume: 3_000_000n,
    listingDate: new Date('2000-03-11'),
    indices: ['NIFTY 50', 'NIFTY IT'],
    ...overrides,
  };
}

interface QueryCall {
  sql: string;
  values: unknown[];
}

function makeEnricher(
  tickers: string[],
  metaByTicker: Map<string, TickerMetaSnapshot>,
  fetchDelay = 0,
): { enricher: TickerMetaEnricher; queryCalls: QueryCall[]; fetchCalls: string[] } {
  const cfg = { get: () => undefined } as unknown as ConfigService;
  const queryCalls: QueryCall[] = [];
  const db = {
    query: async (sql: string, values?: unknown[]) => {
      queryCalls.push({ sql, values: values ?? [] });
      return { rows: tickers.map((t) => ({ ticker: t })) };
    },
  };

  const fetchCalls: string[] = [];
  const provider = {
    name: 'stub',
    batchLimit: 50,
    getQuotes: async () => new Map(),
    getMeta: async (ts: readonly string[]) => {
      fetchCalls.push(...ts);
      await delay(fetchDelay);
      const out = new Map<string, TickerMetaSnapshot>();
      for (const t of ts) {
        const s = metaByTicker.get(t);
        if (s) out.set(t, s);
      }
      return out;
    },
  };

  const enricher = new TickerMetaEnricher(cfg, db as never, provider as never);
  // Expose private TICKER_DELAY_MS = 0 for test speed.
  (enricher as unknown as Record<string, unknown>)['tickerDelayMs'] = 0;

  // Override buildUniverse so we don't need a real DB.
  (enricher as unknown as Record<string, unknown>)['buildUniverse'] = async () => tickers;

  return { enricher, queryCalls, fetchCalls };
}

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// ── tests ─────────────────────────────────────────────────────────────────────

describe('TickerMetaEnricher.upsertMeta', () => {
  it('calls db.query with a properly-shaped INSERT … ON CONFLICT', async () => {
    const snap = makeSnap('INFY.NS');
    const { enricher, queryCalls } = makeEnricher(['INFY.NS'], new Map([['INFY.NS', snap]]));

    await enricher.upsertMeta([snap]);

    expect(queryCalls).toHaveLength(1);
    const { sql } = queryCalls[0]!;
    expect(sql).toMatch(/INSERT INTO ticker_meta/i);
    expect(sql).toMatch(/ON CONFLICT \(ticker\) DO UPDATE/i);
    expect(sql).toMatch(/meta_refreshed_at/i);
  });

  it('includes all 11 value columns in the right order', async () => {
    const snap = makeSnap('TCS.NS');
    const { enricher, queryCalls } = makeEnricher(['TCS.NS'], new Map());

    await enricher.upsertMeta([snap]);

    const { values } = queryCalls[0]!;
    // 11 columns × 1 row = 11 params
    expect(values).toHaveLength(11);
    expect(values[0]).toBe('TCS.NS');            // ticker
    expect(values[1]).toBe('TCS.NS Limited');    // name
    expect(values[2]).toBe('Technology');        // sector
    expect(values[3]).toBe('IT Services');       // sector_domain
    expect(values[4]).toBe('Large Cap');         // market_type
    expect(values[5]).toBe('25.5000');           // pe_ratio
    expect(values[9]).toBe('3000000');           // avg_volume
    expect(values[10]).toBe('2000-03-11');       // listing_date
  });

  it('serialises null optional fields as null', async () => {
    const snap = makeSnap('NEW.NS', {
      sector: null,
      sectorDomain: null,
      marketType: null,
      peRatio: null,
      marketCap: null,
      fiftyTwoWeekHigh: null,
      fiftyTwoWeekLow: null,
      avgVolume: null,
      listingDate: null,
    });
    const { enricher, queryCalls } = makeEnricher([], new Map());

    await enricher.upsertMeta([snap]);

    const { values } = queryCalls[0]!;
    // sector, sectorDomain, marketType, peRatio, marketCap, 52wkH, 52wkL, avgVolume, listingDate
    for (let i = 2; i <= 10; i++) {
      expect(values[i]).toBeNull();
    }
  });

  it('batches multiple tickers into one INSERT', async () => {
    const snaps = ['INFY.NS', 'TCS.NS', 'WIPRO.NS'].map((t) => makeSnap(t));
    const { enricher, queryCalls } = makeEnricher([], new Map());

    await enricher.upsertMeta(snaps);

    expect(queryCalls).toHaveLength(1);
    const { values } = queryCalls[0]!;
    expect(values).toHaveLength(33); // 11 cols × 3 rows
  });

  it('no-ops when given an empty array', async () => {
    const { enricher, queryCalls } = makeEnricher([], new Map());
    await enricher.upsertMeta([]);
    expect(queryCalls).toHaveLength(0);
  });
});

describe('TickerMetaEnricher — provider integration', () => {
  it('calls getMeta once per ticker (serial rate-limited)', async () => {
    const universe = ['INFY.NS', 'TCS.NS', 'WIPRO.NS'];
    const metaMap = new Map(universe.map((t) => [t, makeSnap(t)]));
    const { enricher, fetchCalls } = makeEnricher(universe, metaMap);

    // Drive the job handler directly (skip BullMQ).
    await (enricher as unknown as {
      handleJob: (j: unknown) => Promise<void>;
    }).handleJob({});

    // Each ticker fetched exactly once.
    expect(fetchCalls.sort()).toEqual([...universe].sort());
  });

  it('skips a failing ticker and continues', async () => {
    const cfg = { get: () => undefined } as unknown as ConfigService;
    const queryCalls: QueryCall[] = [];
    const db = {
      query: async (sql: string, values?: unknown[]) => {
        queryCalls.push({ sql, values: values ?? [] });
        return { rows: [{ ticker: 'INFY.NS' }, { ticker: 'BADTICKER' }] };
      },
    };

    let callCount = 0;
    const provider = {
      name: 'stub',
      batchLimit: 50,
      getQuotes: async () => new Map(),
      getMeta: async (ts: readonly string[]) => {
        callCount++;
        if (ts[0] === 'BADTICKER') throw new Error('HTTP 429');
        return new Map([[ts[0]!, makeSnap(ts[0]!)]]);
      },
    };

    const enricher = new TickerMetaEnricher(cfg, db as never, provider as never);
    (enricher as unknown as Record<string, unknown>)['buildUniverse'] = async () => [
      'INFY.NS',
      'BADTICKER',
    ];

    await (enricher as unknown as { handleJob: (j: unknown) => Promise<void> }).handleJob({});

    // Both called, only INFY.NS inserted.
    expect(callCount).toBe(2);
    const upsertCall = queryCalls.find((c) => c.sql.includes('INSERT INTO ticker_meta'));
    expect(upsertCall).toBeDefined();
    expect(upsertCall?.values[0]).toBe('INFY.NS'); // only the successful ticker
  });
});
