import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { DbService, D, toWire, type ServiceSummary } from '@tickernest/common';

@Controller('summary')
export class SummaryController {
  constructor(private readonly db: DbService) {}

  @Get()
  async getSummary(@Req() req: Request): Promise<ServiceSummary> {
    const userId = req.user!.id;
    const { rows } = await this.db.query<{ units: string; avg_nav: string; current_nav: string | null; category: string | null }>(
      `SELECT units, avg_nav, current_nav, category FROM mutual_fund WHERE user_id = $1 AND units::numeric > 0`,
      [userId],
    );

    let totalInvested = D(0);
    let totalCurrent = D(0);
    const breakdown: Record<string, { invested: string; current: string; pl: string }> = {};

    for (const row of rows) {
      const units = D(row.units);
      const invested = units.mul(D(row.avg_nav));
      const current = row.current_nav ? units.mul(D(row.current_nav)) : invested;
      totalInvested = totalInvested.add(invested);
      totalCurrent = totalCurrent.add(current);

      const cat = row.category ?? 'OTHER';
      if (!breakdown[cat]) breakdown[cat] = { invested: '0.0000', current: '0.0000', pl: '0.0000' };
      const b = breakdown[cat]!;
      const bInv = D(b.invested).add(invested);
      const bCur = D(b.current).add(current);
      b.invested = toWire(bInv);
      b.current = toWire(bCur);
      b.pl = toWire(bCur.sub(bInv));
    }

    const totalPL = totalCurrent.sub(totalInvested);
    const plPct = totalInvested.isZero() ? 0 : totalPL.div(totalInvested).mul(100).toNumber();

    return {
      totalInvested: toWire(totalInvested),
      currentValue: toWire(totalCurrent),
      totalPL: toWire(totalPL),
      plPct: Math.round(plPct * 100) / 100,
      asOf: new Date().toISOString(),
      breakdown,
    };
  }
}
