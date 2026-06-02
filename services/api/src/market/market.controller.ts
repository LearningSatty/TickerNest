/**
 * GET /market/snapshot
 * Returns:
 *   - The 7 fixed indices/futures shown across every watchlist page
 *     (NIFTY 50, NIFTY BANK, NIFTY MIDCAP, NIFTY SMALLCAP, NIFTY IT,
 *     NASDAQ FUTURE, DOW FUTURE).
 *   - Advance/Decline ratio for the day, computed from the union of the
 *     user's watchlist tickers (so it reflects what *they* track).  If the
 *     user has no tickers yet, returns advances=0/declines=0 with a hint
 *     so the UI can show a placeholder.
 *
 * The QuoteCache memoises every quote so this endpoint is cheap on hot path.
 */
import { Controller, Get, Req, UnauthorizedException } from '@nestjs/common';
import { D, Money } from '../common/types/money';
import { DbService } from '../common/db.service';
import { QuoteCache } from '../quote/quote.cache';

interface IndexQuote {
  ticker: string;       // Yahoo symbol e.g. '^NSEI'
  label: string;        // Display label e.g. 'NIFTY 50'
  currentPrice: string;
  prevClose: string;
  dayChange: string;
  dayChangePct: string;
  currency: string;
}

interface BreadthSummary {
  advances: number;
  declines: number;
  unchanged: number;
  total: number;
  /** advances / declines, rounded to 2 dp; null when declines == 0. */
  ratio: string | null;
  source: 'watchlist' | 'empty';
}

interface MarketSnapshot {
  indices: IndexQuote[];
  breadth: BreadthSummary;
}

/** The pinned top-strip indices, in display order. */
export const MARKET_INDICES: ReadonlyArray<{
  ticker: string;
  label: string;
  /** Defaults to INR; use 'USD' for futures / commodities / crypto. */
  currency?: 'INR' | 'USD';
}> = [
  { ticker: '^NSEI',                 label: 'NIFTY 50' },
  { ticker: '^NSEBANK',              label: 'NIFTY BANK' },
  { ticker: 'NIFTY_MIDCAP_100.NS',   label: 'NIFTY MIDCAP' },
  { ticker: '^CNXSC',                label: 'NIFTY SMALLCAP' },
  { ticker: '^CNXIT',                label: 'NIFTY IT' },
  { ticker: '^INDIAVIX',             label: 'INDIA VIX' },
  { ticker: '^IXIC',                 label: 'NASDAQ',     currency: 'USD' },
  { ticker: 'NQ=F',                  label: 'NASDAQ FUT', currency: 'USD' },
  { ticker: 'YM=F',                  label: 'DOW FUT',    currency: 'USD' },
  { ticker: 'BZ=F',                  label: 'BRENT CRUDE', currency: 'USD' },
  { ticker: 'GC=F',                  label: 'GOLD',        currency: 'USD' },
  { ticker: 'BTC-USD',               label: 'BITCOIN',     currency: 'USD' },
];

@Controller('market')
export class MarketController {
  constructor(
    private readonly db: DbService,
    private readonly quotes: QuoteCache,
  ) {}

  @Get('snapshot')
  async snapshot(@Req() req: { user?: { id: string } }): Promise<MarketSnapshot> {
    if (!req.user) throw new UnauthorizedException();
    const userId = req.user.id;

    // Universe = indices ∪ user's watchlist tickers (one batched fetch).
    const userTickers = await this.db.withUserTx(userId, async (tx) => {
      const r = await tx.query<{ ticker: string }>(
        `SELECT DISTINCT ticker FROM watchlist_item WHERE user_id = $1`,
        [userId],
      );
      return r.rows.map((x) => x.ticker);
    });
    const indexTickers = MARKET_INDICES.map((i) => i.ticker);
    const allTickers = [...new Set([...indexTickers, ...userTickers])];
    const quotes = await this.quotes.getMany(allTickers);

    // ── Indices (always returned in fixed order; missing => zeros) ──
    const indices: IndexQuote[] = MARKET_INDICES.map(({ ticker, label, currency }) => {
      const q = quotes.get(ticker);
      const ltp = q?.ltp ?? D(0);
      const prev = q?.prevClose ?? D(0);
      const change = ltp.sub(prev);
      const changePct = prev.isZero() ? D(0) : change.div(prev);
      return {
        ticker,
        label,
        currentPrice: ltp.toFixed(4),
        prevClose: prev.toFixed(4),
        dayChange: change.toFixed(4),
        dayChangePct: changePct.toFixed(6),
        currency: currency ?? 'INR',
      };
    });

    // ── Advance / Decline (from user's watchlist universe) ──
    let advances = 0, declines = 0, unchanged = 0;
    for (const t of userTickers) {
      const q = quotes.get(t);
      if (!q || q.ltp.isZero()) continue;
      const change: Money = q.ltp.sub(q.prevClose);
      if (change.isPositive()) advances++;
      else if (change.isNegative()) declines++;
      else unchanged++;
    }
    const total = advances + declines + unchanged;
    const ratio = declines === 0
      ? null
      : D(advances).div(D(declines)).toFixed(2);

    return {
      indices,
      breadth: {
        advances,
        declines,
        unchanged,
        total,
        ratio,
        source: total === 0 ? 'empty' : 'watchlist',
      },
    };
  }
}
