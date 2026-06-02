import { parse as papaParse } from 'papaparse';
import { z } from 'zod';
import { D, Money } from '../common/types/money';
import { BrokerCsvProfile } from '../common/providers/csv-profile';

const NumStr = z.string().regex(/^-?\d+(\.\d+)?$/, 'expected numeric string');
const Row = z.object({
  ticker: z.string().min(1),
  qty: NumStr,
  avgPrice: NumStr,
});

export interface ParsedRow {
  ticker: string;
  qty: Money;
  avgCost: Money;
}
export interface ParseResult {
  rows: ParsedRow[];
  rejected: { rowIndex: number; reason: string; raw: unknown }[];
  totalRows: number;
}

const normaliseTicker = (raw: string, profile: BrokerCsvProfile): string => {
  let t = raw.trim();
  for (const p of profile.tickerTransform.stripPrefix)
    if (t.startsWith(p)) t = t.slice(p.length);
  for (const s of profile.tickerTransform.stripSuffix)
    if (t.endsWith(s)) t = t.slice(0, -s.length);
  return profile.tickerTransform.uppercase ? t.toUpperCase() : t;
};

export const parseCsv = (
  content: string,
  profile: BrokerCsvProfile,
): ParseResult => {
  const skip = profile.parser.skipRows;
  const headerRow = profile.parser.headerRow;

  const lines = content.split(/\r?\n/);
  const sliced = lines.slice(skip).join('\n');

  const parsed = papaParse(sliced, {
    delimiter: profile.parser.delimiter,
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const rows: ParsedRow[] = [];
  const rejected: ParseResult['rejected'] = [];
  const records = (parsed.data as Record<string, string>[]).slice(headerRow);

  for (let i = 0; i < records.length; i++) {
    const r = records[i]!;
    const tickerRaw = r[profile.columns.ticker];
    const qtyRaw = r[profile.columns.quantity];
    const avgRaw = r[profile.columns.avgPrice];

    const candidate = {
      ticker: tickerRaw ? normaliseTicker(tickerRaw, profile) : '',
      qty: (qtyRaw ?? '').replace(/[, ]/g, ''),
      avgPrice: (avgRaw ?? '').replace(/[, ]/g, ''),
    };

    const v = Row.safeParse(candidate);
    if (!v.success) {
      rejected.push({ rowIndex: i, reason: v.error.message, raw: r });
      continue;
    }
    rows.push({
      ticker: v.data.ticker,
      qty: D(v.data.qty),
      avgCost: D(v.data.avgPrice),
    });
  }

  return { rows, rejected, totalRows: records.length };
};
