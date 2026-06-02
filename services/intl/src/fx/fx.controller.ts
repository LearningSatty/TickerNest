import { Controller, Get, Query } from '@nestjs/common';
import { DbService, D, toWire } from '@tickernest/common';

@Controller('fx')
export class FxController {
  constructor(private readonly db: DbService) {}

  @Get('rates')
  async getRates() {
    const { rows } = await this.db.query<{ pair: string; date: string; rate: string; source: string | null }>(
      `SELECT DISTINCT ON (pair) pair, date, rate, source
       FROM fx_rate ORDER BY pair, date DESC`,
    );
    return rows.map((r) => ({
      pair: r.pair,
      date: r.date,
      rate: r.rate,
      source: r.source,
    }));
  }

  @Get('convert')
  async convert(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('amount') amount: string,
  ) {
    const pair = `${from}/${to}`;
    const { rows } = await this.db.query<{ rate: string }>(
      `SELECT rate FROM fx_rate WHERE pair = $1 ORDER BY date DESC LIMIT 1`,
      [pair],
    );

    if (rows.length === 0) {
      return { error: `No rate found for ${pair}`, converted: null };
    }

    const rate = D(rows[0]!.rate);
    const amt = D(amount);
    const converted = amt.mul(rate);

    return {
      from,
      to,
      amount,
      rate: rows[0]!.rate,
      converted: toWire(converted),
    };
  }
}
