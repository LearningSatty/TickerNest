import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { DbService, D, toWire, type ServiceSummary } from '@tickernest/common';

@Controller('summary')
export class SummaryController {
  constructor(private readonly db: DbService) {}

  @Get()
  async getSummary(@Req() req: Request): Promise<ServiceSummary> {
    const userId = req.user!.id;

    // Gold: SUM(weight_grams * purchase_price_per_gram)
    const { rows: goldRows } = await this.db.query<{ invested: string }>(
      `SELECT COALESCE(SUM(weight_grams * purchase_price_per_gram), 0) AS invested
       FROM gold_holding WHERE user_id = $1`,
      [userId],
    );
    const goldInvested = D(goldRows[0]?.invested ?? '0');

    // SGB: SUM(units * purchase_nav)
    const { rows: sgbRows } = await this.db.query<{ invested: string }>(
      `SELECT COALESCE(SUM(units * purchase_nav), 0) AS invested
       FROM sgb_holding WHERE user_id = $1`,
      [userId],
    );
    const sgbInvested = D(sgbRows[0]?.invested ?? '0');

    // Manual assets: SUM(invested), SUM(current_value)
    const { rows: manualRows } = await this.db.query<{ invested: string; current_value: string }>(
      `SELECT COALESCE(SUM(invested), 0) AS invested, COALESCE(SUM(current_value), 0) AS current_value
       FROM manual_asset WHERE user_id = $1`,
      [userId],
    );
    const manualInvested = D(manualRows[0]?.invested ?? '0');
    const manualCurrent = D(manualRows[0]?.current_value ?? '0');

    // For MVP: gold & sgb currentValue = invested (no live rate)
    const totalInvested = goldInvested.add(sgbInvested).add(manualInvested);
    const totalCurrent = goldInvested.add(sgbInvested).add(manualCurrent);
    const totalPL = totalCurrent.sub(totalInvested);
    const plPct = totalInvested.isZero() ? 0 : totalPL.div(totalInvested).mul(100).toNumber();

    return {
      totalInvested: toWire(totalInvested),
      currentValue: toWire(totalCurrent),
      totalPL: toWire(totalPL),
      plPct: Math.round(plPct * 100) / 100,
      asOf: new Date().toISOString(),
      breakdown: {
        gold: {
          invested: toWire(goldInvested),
          current: toWire(goldInvested),
          pl: '0.0000',
        },
        sgb: {
          invested: toWire(sgbInvested),
          current: toWire(sgbInvested),
          pl: '0.0000',
        },
        manual: {
          invested: toWire(manualInvested),
          current: toWire(manualCurrent),
          pl: toWire(manualCurrent.sub(manualInvested)),
        },
      },
    };
  }
}
