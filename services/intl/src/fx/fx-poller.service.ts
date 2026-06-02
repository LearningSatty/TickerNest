import { Injectable, Logger } from '@nestjs/common';
import { DbService } from '@tickernest/common';

const PAIRS = ['USD/INR', 'EUR/INR', 'GBP/INR'];

@Injectable()
export class FxPollerService {
  private readonly log = new Logger(FxPollerService.name);

  constructor(private readonly db: DbService) {}

  async pollAll(): Promise<{ updated: number; errors: number }> {
    let updated = 0;
    let errors = 0;

    for (const pair of PAIRS) {
      try {
        const rate = await this.fetchRate(pair);
        if (rate !== null) {
          await this.db.query(
            `INSERT INTO fx_rate (pair, date, rate, source)
             VALUES ($1, CURRENT_DATE, $2, 'exchangerate.host')
             ON CONFLICT (pair, date) DO UPDATE SET rate = EXCLUDED.rate, source = EXCLUDED.source`,
            [pair, rate],
          );
          updated++;
        }
      } catch (e) {
        this.log.warn(`Failed to fetch rate for ${pair}: ${(e as Error).message}`);
        errors++;
      }
    }

    this.log.log(`FX poll complete: ${updated} updated, ${errors} errors`);
    return { updated, errors };
  }

  private async fetchRate(pair: string): Promise<string | null> {
    const [from, to] = pair.split('/');
    const url = `https://api.exchangerate.host/latest?base=${from}&symbols=${to}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json() as { rates?: Record<string, number> };
    const rate = json.rates?.[to!];
    return rate !== undefined ? String(rate) : null;
  }
}
