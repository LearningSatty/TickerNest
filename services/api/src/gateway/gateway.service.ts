import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface ServiceSummary {
  totalInvested: string;
  currentValue: string;
  totalPL: string;
  plPct: number;
  asOf: string;
  breakdown: Record<string, { invested: string; current: string; pl: string }>;
}

@Injectable()
export class GatewayService {
  private readonly log = new Logger(GatewayService.name);
  private readonly mfUrl: string;
  private readonly intlUrl: string;
  private readonly physicalUrl: string;

  constructor(private readonly cfg: ConfigService) {
    this.mfUrl = cfg.get('MF_SERVICE_URL') || 'http://tickernest-mf.internal:3001';
    this.intlUrl = cfg.get('INTL_SERVICE_URL') || 'http://tickernest-intl.internal:3002';
    this.physicalUrl = cfg.get('PHYSICAL_SERVICE_URL') || 'http://tickernest-physical.internal:3003';
  }

  async getNetWorth(userId: string, token: string) {
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    const [mf, intl, physical] = await Promise.allSettled([
      this.fetchSummary(this.mfUrl, headers),
      this.fetchSummary(this.intlUrl, headers),
      this.fetchSummary(this.physicalUrl, headers),
    ]);

    const extract = (r: PromiseSettledResult<ServiceSummary>): ServiceSummary | null =>
      r.status === 'fulfilled' ? r.value : null;

    const parts = [extract(mf), extract(intl), extract(physical)].filter(Boolean) as ServiceSummary[];

    const sum = (field: 'totalInvested' | 'currentValue' | 'totalPL') =>
      parts.reduce((acc, p) => {
        const val = parseFloat(p[field]) || 0;
        return acc + val;
      }, 0);

    const totalInvested = sum('totalInvested');
    const totalCurrent = sum('currentValue');
    const totalPL = totalCurrent - totalInvested;
    const plPct = totalInvested === 0 ? 0 : Math.round((totalPL / totalInvested) * 10000) / 100;

    return {
      mutualFunds: extract(mf),
      international: extract(intl),
      physicalAssets: extract(physical),
      total: {
        invested: totalInvested.toFixed(4),
        current: totalCurrent.toFixed(4),
        pl: totalPL.toFixed(4),
        plPct,
      },
      degraded: [mf, intl, physical].some(r => r.status === 'rejected'),
    };
  }

  private async fetchSummary(baseUrl: string, headers: Record<string, string>): Promise<ServiceSummary> {
    const res = await fetch(`${baseUrl}/summary`, { headers });
    if (!res.ok) throw new Error(`${baseUrl} returned ${res.status}`);
    return res.json() as Promise<ServiceSummary>;
  }
}
