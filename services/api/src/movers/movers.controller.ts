import { Controller, Get, Query, Req, UnauthorizedException } from '@nestjs/common';
import { D } from '../common/types/money';
import { computeMovers } from './movers.compute';
import { DbService } from '../common/db.service';
import { QuoteCache } from '../quote/quote.cache';

@Controller('movers')
export class MoversController {
  constructor(
    private readonly db: DbService,
    private readonly quotes: QuoteCache,
  ) {}

  @Get()
  async list(
    @Req() req: { user?: { id: string } },
    @Query('threshold') threshold = '0.10',
  ) {
    if (!req.user) throw new UnauthorizedException();
    const userId = req.user.id;
    const universe = await this.db.withUserTx(userId, async (tx) => {
      const r = await tx.query<{ ticker: string }>(
        `SELECT DISTINCT ticker FROM (
            SELECT ticker FROM holding
              WHERE user_id = $1 AND qty > 0
            UNION
            SELECT wi.ticker FROM watchlist_item wi
              WHERE wi.user_id = $1
         ) u`,
        [userId],
      );
      return r.rows.map((x) => x.ticker);
    });
    const quotes = await this.quotes.getMany(universe);
    const inputs = [...quotes.entries()].map(([ticker, q]) => ({
      ticker, ltp: q.ltp, prevClose: q.prevClose,
    }));
    const m = computeMovers(inputs, D(threshold));
    return {
      gainers: m.gainers.map(toApi),
      losers: m.losers.map(toApi),
    };
  }
}

function toApi(r: { ticker: string; changePct: import('../common/types/money').Money;
                    changeAbs: import('../common/types/money').Money;
                    ltp: import('../common/types/money').Money }) {
  return {
    ticker: r.ticker,
    changePct: r.changePct.toString(),
    changeAbs: r.changeAbs.toFixed(4),
    ltp: r.ltp.toFixed(4),
  };
}
