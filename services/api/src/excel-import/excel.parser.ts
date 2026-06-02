/**
 * Excel onboarding parser. The user's existing My-Portfolio.xlsx is
 * ingested in one upload: every broker sheet becomes a CSV-import scoped
 * to that broker, and they're committed inside a single TX in the parent
 * `excel_import` row so a partial failure rolls back the whole onboarding.
 *
 * The 17-column body schema observed in My-Portfolio.xlsx (header row 5):
 *   Ticker | Name | Sector | Sector-Domain | Market Type | Total Holding |
 *   Avg. Price | Current Price | Prev. Close | Change | Change % |
 *   Today's P/L | Invested Cost | Current Cost | Overall Change % |
 *   Overall P/L | PE Ratio
 *
 * We only consume {Ticker, Total Holding, Avg. Price} to build positions;
 * everything else is discarded (live values come from QuoteProvider).
 */
import ExcelJS from 'exceljs';
import { D, Money } from '../common/types/money';

export interface ExcelBrokerSheet {
  brokerHint: string; // sheet name e.g. "ICICI DIrect", "Kite-Juhi"
  rows: { ticker: string; qty: Money; avgCost: Money }[];
  rejected: { rowIndex: number; reason: string }[];
}

const BROKER_SHEET_NAMES = new Set([
  'ICICI DIrect',
  'IIFL',
  'Groww',
  'Kite-Juhi',
  'AngelOne-Mom',
  'Groww-Papa',
  'IND-Money',
  'IND-Money JUHI',
  'AngelOne-Satty',
  'MStock',
]);

const HEADER_ROW = 5;
const TICKER_COL = 1;
const QTY_COL = 6;
const AVG_PRICE_COL = 7;

export const parseExcel = async (
  buffer: ArrayBuffer,
): Promise<ExcelBrokerSheet[]> => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const out: ExcelBrokerSheet[] = [];
  for (const ws of wb.worksheets) {
    if (!BROKER_SHEET_NAMES.has(ws.name)) continue;
    const sheet: ExcelBrokerSheet = { brokerHint: ws.name, rows: [], rejected: [] };
    for (let r = HEADER_ROW + 1; r <= ws.actualRowCount; r++) {
      const tickerCell = ws.getCell(r, TICKER_COL).value;
      const qtyCell = ws.getCell(r, QTY_COL).value;
      const avgCell = ws.getCell(r, AVG_PRICE_COL).value;
      if (!tickerCell || qtyCell == null) continue; // blank line

      const ticker = String(tickerCell)
        .replace(/^NSE:/, '')
        .replace(/^BOM:/, '')
        .trim()
        .toUpperCase();
      const qtyN = Number(qtyCell);
      const avgN = Number(avgCell);
      if (!Number.isFinite(qtyN) || !Number.isFinite(avgN)) {
        sheet.rejected.push({ rowIndex: r, reason: 'non-numeric qty/avg' });
        continue;
      }
      if (qtyN === 0) continue; // not a holding
      sheet.rows.push({ ticker, qty: D(qtyN), avgCost: D(avgN) });
    }
    out.push(sheet);
  }
  return out;
};
