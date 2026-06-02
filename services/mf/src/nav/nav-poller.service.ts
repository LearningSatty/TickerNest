import { Injectable, Logger } from '@nestjs/common';
import { DbService } from '@tickernest/common';

@Injectable()
export class NavPollerService {
  private readonly log = new Logger(NavPollerService.name);

  constructor(private readonly db: DbService) {}

  async pollAll(): Promise<{ updated: number; errors: number }> {
    const { rows } = await this.db.query<{ scheme_code: string }>(
      `SELECT DISTINCT scheme_code FROM mutual_fund WHERE units::numeric > 0`,
    );

    let updated = 0;
    let errors = 0;

    for (const { scheme_code } of rows) {
      try {
        const nav = await this.fetchLatestNav(scheme_code);
        if (nav !== null) {
          await this.db.query(
            `UPDATE mutual_fund SET current_nav = $1, updated_at = NOW() WHERE scheme_code = $2`,
            [nav, scheme_code],
          );
          await this.db.query(
            `INSERT INTO mf_nav_history (scheme_code, date, nav) VALUES ($1, CURRENT_DATE, $2)
             ON CONFLICT (scheme_code, date) DO UPDATE SET nav = EXCLUDED.nav`,
            [scheme_code, nav],
          );
          updated++;
        }
      } catch (e) {
        this.log.warn(`Failed to fetch NAV for ${scheme_code}: ${(e as Error).message}`);
        errors++;
      }
    }

    this.log.log(`NAV poll complete: ${updated} updated, ${errors} errors`);
    return { updated, errors };
  }

  private async fetchLatestNav(schemeCode: string): Promise<string | null> {
    const url = `https://api.mfapi.in/mf/${schemeCode}/latest`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json() as { data?: Array<{ nav: string }> };
    return json.data?.[0]?.nav ?? null;
  }
}
