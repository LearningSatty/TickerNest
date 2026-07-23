import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { DbService, D, toWire, type ServiceSummary } from '@tickernest/common';

@Controller('summary')
export class SummaryController {
  constructor(private readonly db: DbService) {}

  @Get()
  async getSummary(@Req() req: Request): Promise<ServiceSummary> {
    const userId = req.user!.id;

    // Get latest USD/INR rate
    const { rows: fxRows } = await this.db.query<{ rate: string }>(
      `SELECT rate FROM fx_rate WHERE pair = 'USD/INR' ORDER BY date DESC LIMIT 1`,
    );
    const usdInrRate = fxRows[0]?.rate ? D(fxRows[0].rate) : null;

    // Get US holdings
    const { rows: usRows } = await this.db.query<{ qty: string; avg_cost_usd: string }>(
      `SELECT qty, avg_cost_usd FROM us_holding WHERE user_id = $1 AND qty::numeric > 0`,
      [userId],
    );

    let usInvestedUsd = D(0);
    let usInvestedInr = D(0);
    for (const row of usRows) {
      const invested = D(row.qty).mul(D(row.avg_cost_usd));
      usInvestedUsd = usInvestedUsd.add(invested);
      if (usdInrRate) {
        usInvestedInr = usInvestedInr.add(invested.mul(usdInrRate));
      }
    }

    // Get crypto holdings
    const { rows: cryptoRows } = await this.db.query<{ qty: string; avg_cost_inr: string }>(
      `SELECT qty, avg_cost_inr FROM crypto_holding WHERE user_id = $1 AND qty::numeric > 0`,
      [userId],
    );

    let cryptoInvestedInr = D(0);
    for (const row of cryptoRows) {
      cryptoInvestedInr = cryptoInvestedInr.add(D(row.qty).mul(D(row.avg_cost_inr)));
    }

    const totalInvested = usInvestedInr.add(cryptoInvestedInr);

    return {
      totalInvested: toWire(totalInvested),
      currentValue: toWire(totalInvested), // no live pricing yet
      totalPL: '0.0000',
      plPct: 0,
      asOf: new Date().toISOString(),
      breakdown: {
        us: {
          invested: toWire(usInvestedInr),
          current: toWire(usInvestedInr),
          pl: '0.0000',
        },
        crypto: {
          invested: toWire(cryptoInvestedInr),
          current: toWire(cryptoInvestedInr),
          pl: '0.0000',
        },
      },
    };
  }
}
