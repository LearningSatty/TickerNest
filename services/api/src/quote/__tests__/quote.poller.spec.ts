/**
 * Unit tests for QuotePollerService.
 *
 * We test the pure logic that lives in public methods without spinning up
 * BullMQ or a real Redis. The BullMQ queue/worker are instantiated only in
 * onModuleInit (which we skip here) so we inject all dependencies as stubs.
 */
import { QuotePollerService, QuoteTick } from '../quote.poller';
import { D } from '../../common/types/money';
import { Quote } from '../../common/providers/quote.provider';
import { ConfigService } from '@nestjs/config';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeQuote(ticker: string, ltp: string, prev: string): Quote {
  const l = D(ltp);
  const p = D(prev);
  return {
    ticker,
    ltp: l,
    prevClose: p,
    change: l.sub(p),
    changePct: p.isZero() ? D(0) : l.sub(p).div(p),
    todayHigh: l.add(D('10')),
    todayLow: l.sub(D('5')),
    volume: 1_000_000n,
    currency: 'INR',
    asOf: new Date('2024-01-15T09:30:00Z'),
  };
}

interface EmitCall {
  userId: string;
  event: string;
  payload: unknown;
}

function makePoller(
  universeRows: Array<{ user_id: string; ticker: string }>,
  quotes: Map<string, Quote>,
  emits: EmitCall[],
): QuotePollerService {
  const cfg = {
    get: (_key: string) => undefined,
  } as unknown as ConfigService;

  const provider = {
    name: 'stub',
    batchLimit: 50,
    getQuotes: async () => quotes,
    getMeta: async () => new Map(),
  };

  const gateway = {
    emitToUser: (userId: string, event: string, payload: unknown) => {
      emits.push({ userId, event, payload });
    },
  };

  const db = {
    query: async () => ({ rows: universeRows }),
  };

  // Construct without triggering onModuleInit (we skip Redis/BullMQ).
  const poller = new QuotePollerService(
    cfg,
    db as never,
    provider as never,
    gateway as never,
  );

  // Stub writeToRedis and writeToTickerMeta so they don't need real connections.
  // Access private methods via index signature for test purposes.
  (poller as unknown as Record<string, unknown>)['writeToRedis'] = async () => {};
  (poller as unknown as Record<string, unknown>)['writeToTickerMeta'] = async () => {};

  // Stub buildUniverse to return the fixed rows.
  (poller as unknown as Record<string, unknown>)['buildUniverse'] = async () =>
    universeRows;

  return poller;
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('QuotePollerService.pollQuotes', () => {
  it('emits quote.tick to each user with their own tickers', async () => {
    const quotes = new Map([
      ['INFY.NS', makeQuote('INFY.NS', '1602.50', '1580')],
      ['HDFC.NS', makeQuote('HDFC.NS', '1700', '1690')],
      ['TCS.NS', makeQuote('TCS.NS', '3900', '3880')],
    ]);
    const universe = [
      { user_id: 'u1', ticker: 'INFY.NS' },
      { user_id: 'u1', ticker: 'HDFC.NS' },
      { user_id: 'u2', ticker: 'INFY.NS' },
      { user_id: 'u2', ticker: 'TCS.NS' },
    ];
    const emits: EmitCall[] = [];
    const poller = makePoller(universe, quotes, emits);

    await poller.pollQuotes();

    const u1Emit = emits.find((e) => e.userId === 'u1');
    const u2Emit = emits.find((e) => e.userId === 'u2');
    expect(u1Emit).toBeDefined();
    expect(u2Emit).toBeDefined();

    const u1Ticks = u1Emit!.payload as QuoteTick[];
    const u2Ticks = u2Emit!.payload as QuoteTick[];

    const u1Symbols = u1Ticks.map((t) => t.ticker).sort();
    const u2Symbols = u2Ticks.map((t) => t.ticker).sort();
    expect(u1Symbols).toEqual(['HDFC.NS', 'INFY.NS']);
    expect(u2Symbols).toEqual(['INFY.NS', 'TCS.NS']);
  });

  it('emits quote.tick event name', async () => {
    const quotes = new Map([['INFY.NS', makeQuote('INFY.NS', '1602.50', '1580')]]);
    const universe = [{ user_id: 'u1', ticker: 'INFY.NS' }];
    const emits: EmitCall[] = [];
    const poller = makePoller(universe, quotes, emits);

    await poller.pollQuotes();

    expect(emits).toHaveLength(1);
    expect(emits[0]!.event).toBe('quote.tick');
  });

  it('serialises ltp as 4dp string (Money → wire)', async () => {
    const quotes = new Map([['RELIANCE.NS', makeQuote('RELIANCE.NS', '2456.789', '2400')]]);
    const universe = [{ user_id: 'u1', ticker: 'RELIANCE.NS' }];
    const emits: EmitCall[] = [];
    const poller = makePoller(universe, quotes, emits);

    await poller.pollQuotes();

    const ticks = emits[0]!.payload as QuoteTick[];
    expect(ticks[0]!.ltp).toBe('2456.7890');
  });

  it('does nothing when universe is empty', async () => {
    const emits: EmitCall[] = [];
    const poller = makePoller([], new Map(), emits);
    await poller.pollQuotes();
    expect(emits).toHaveLength(0);
  });

  it('deduplicates tickers shared by multiple users', async () => {
    let fetchCount = 0;
    const quotes = new Map([['INFY.NS', makeQuote('INFY.NS', '1600', '1580')]]);
    const universe = [
      { user_id: 'u1', ticker: 'INFY.NS' },
      { user_id: 'u2', ticker: 'INFY.NS' },
      { user_id: 'u3', ticker: 'INFY.NS' },
    ];

    const provider = {
      name: 'stub',
      batchLimit: 50,
      getQuotes: async (tickers: readonly string[]) => {
        fetchCount++;
        // All three users share INFY.NS — provider should be called once with ['INFY.NS']
        return new Map(tickers.map((t) => [t, makeQuote(t, '1600', '1580')]));
      },
      getMeta: async () => new Map(),
    };

    const cfg = { get: () => undefined } as unknown as ConfigService;
    const db = { query: async () => ({ rows: universe }) };
    const emits: EmitCall[] = [];
    const gateway = {
      emitToUser: (userId: string, event: string, payload: unknown) =>
        emits.push({ userId, event, payload }),
    };

    const poller = new QuotePollerService(cfg, db as never, provider as never, gateway as never);
    (poller as unknown as Record<string, unknown>)['writeToRedis'] = async () => {};
    (poller as unknown as Record<string, unknown>)['writeToTickerMeta'] = async () => {};
    (poller as unknown as Record<string, unknown>)['buildUniverse'] = async () => universe;

    await poller.pollQuotes();

    // Provider called once, but all 3 users get their tick.
    expect(fetchCount).toBe(1);
    expect(emits.map((e) => e.userId).sort()).toEqual(['u1', 'u2', 'u3']);
  });

  it('skips a user when none of their tickers came back from provider', async () => {
    // u2 watches NOFEED.NS which the (stub) provider didn't return data for.
    const quotes = new Map([['INFY.NS', makeQuote('INFY.NS', '1600', '1580')]]);
    const universe = [
      { user_id: 'u1', ticker: 'INFY.NS' },
      { user_id: 'u2', ticker: 'NOFEED.NS' },
    ];
    const emits: EmitCall[] = [];
    const poller = makePoller(universe, quotes, emits);

    await poller.pollQuotes();

    expect(emits.map((e) => e.userId)).toEqual(['u1']); // u2 not emitted
  });
});
