export interface ServiceSummary {
  totalInvested: string;
  currentValue: string;
  totalPL: string;
  plPct: number;
  asOf: string;
  breakdown: Record<string, {
    invested: string;
    current: string;
    pl: string;
  }>;
}
