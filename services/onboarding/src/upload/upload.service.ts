/**
 * Upload Service — handles Excel parsing, sheet preview, range extraction,
 * column auto-detection, and final broker+holdings creation.
 *
 * Flow:
 *  1. POST /upload         → parse Excel, store in memory (session map), return sheet list
 *  2. GET  /upload/:id/sheet/:name → return raw grid for one sheet (preview)
 *  3. POST /upload/:id/extract     → given sheet + range → return parsed rows with detected columns
 *  4. POST /upload/:id/save        → given column mapping + broker name → persist to DB
 */
import { Injectable, Logger } from '@nestjs/common';
import { DbService } from '@tickernest/common';
import * as ExcelJS from 'exceljs';

/** In-memory session storage for uploaded workbooks (keyed by session ID). */
interface UploadSession {
  userId: string;
  sheets: SheetMeta[];
  /** Raw cell data per sheet (sheet name → 2D string array). */
  data: Map<string, string[][]>;
  createdAt: number;
}

export interface SheetMeta {
  name: string;
  rowCount: number;
  colCount: number;
}

export interface ExtractedData {
  headers: string[];
  rows: string[][];
}

@Injectable()
export class UploadService {
  private readonly log = new Logger(UploadService.name);
  /** Session map: uploadId → UploadSession. TTL cleaned on access. */
  private readonly sessions = new Map<string, UploadSession>();
  private static readonly SESSION_TTL_MS = 30 * 60 * 1000; // 30 min

  constructor(private readonly db: DbService) {
    // Periodic cleanup every 5 min
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * Parse uploaded Excel buffer, store in session, return sheet metadata.
   */
  async parseExcel(userId: string, buffer: Buffer): Promise<{ uploadId: string; sheets: SheetMeta[] }> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);

    const sheets: SheetMeta[] = [];
    const data = new Map<string, string[][]>();

    wb.eachSheet((ws) => {
      const grid: string[][] = [];
      let maxCol = 0;
      ws.eachRow({ includeEmpty: true }, (row, rowNum) => {
        const cells: string[] = [];
        row.eachCell({ includeEmpty: true }, (cell, colNum) => {
          cells[colNum - 1] = this.cellToString(cell);
          if (colNum > maxCol) maxCol = colNum;
        });
        // Pad short rows
        while (cells.length < maxCol) cells.push('');
        grid[rowNum - 1] = cells;
      });
      // Trim trailing empty rows
      while (grid.length > 0 && grid[grid.length - 1]!.every((c) => !c)) grid.pop();

      sheets.push({ name: ws.name, rowCount: grid.length, colCount: maxCol });
      data.set(ws.name, grid);
    });

    // Evict any previous sessions for this user (1 active upload per user)
    for (const [existingId, existing] of this.sessions) {
      if (existing.userId === userId) {
        this.sessions.delete(existingId);
        this.log.log(`Evicted stale session ${existingId} for user ${userId}`);
      }
    }

    const uploadId = this.generateId();
    this.sessions.set(uploadId, { userId, sheets, data, createdAt: Date.now() });
    this.log.log(`Parsed Excel for user ${userId}: ${sheets.length} sheets, uploadId=${uploadId}`);
    return { uploadId, sheets };
  }

  /**
   * Get raw grid data for a specific sheet (for preview).
   * Returns up to 200 rows for performance.
   */
  getSheetPreview(uploadId: string, userId: string, sheetName: string): { grid: string[][]; totalRows: number; totalCols: number } | null {
    const session = this.getSession(uploadId, userId);
    if (!session) return null;
    const grid = session.data.get(sheetName);
    if (!grid) return null;
    const meta = session.sheets.find((s) => s.name === sheetName);
    return {
      grid: grid.slice(0, 200), // Cap at 200 rows for preview
      totalRows: grid.length,
      totalCols: meta?.colCount ?? 0,
    };
  }

  /**
   * Extract a specific range from a sheet. Returns headers (first row of range) + data rows.
   */
  extractRange(
    uploadId: string,
    userId: string,
    sheetName: string,
    startRow: number, // 1-based
    endRow: number,   // 1-based, inclusive
    startCol: number, // 1-based
    endCol: number,   // 1-based, inclusive
  ): ExtractedData | null {
    const session = this.getSession(uploadId, userId);
    if (!session) return null;
    const grid = session.data.get(sheetName);
    if (!grid) return null;

    // Convert to 0-based
    const r0 = Math.max(0, startRow - 1);
    const r1 = Math.min(grid.length - 1, endRow - 1);
    const c0 = Math.max(0, startCol - 1);
    const c1 = Math.max(c0, endCol - 1);

    const sliced: string[][] = [];
    for (let r = r0; r <= r1; r++) {
      const row = grid[r] ?? [];
      sliced.push(row.slice(c0, c1 + 1));
    }

    if (sliced.length === 0) return { headers: [], rows: [] };

    // First row of selection = headers
    const headers = sliced[0]!.map((h) => h.trim() || `Col ${sliced[0]!.indexOf(h) + 1}`);
    const rows = sliced.slice(1).filter((row) => row.some((c) => c.trim()));

    return { headers, rows };
  }

  /**
   * Extract specific rows and columns by index arrays (1-based).
   * First selected row is treated as headers.
   * Supports non-contiguous selections like rows [1,2,3,4,5,8] cols [1,2,5,6,7].
   */
  extractByIndices(
    uploadId: string,
    userId: string,
    sheetName: string,
    rowIndices: number[], // 1-based, sorted
    colIndices: number[], // 1-based, sorted
  ): ExtractedData | null {
    const session = this.getSession(uploadId, userId);
    if (!session) return null;
    const grid = session.data.get(sheetName);
    if (!grid) return null;

    if (rowIndices.length === 0 || colIndices.length === 0) return { headers: [], rows: [] };

    // Extract only the specified rows/cols
    const sliced: string[][] = [];
    for (const ri of rowIndices) {
      const row = grid[ri - 1]; // convert to 0-based
      if (!row) { sliced.push(colIndices.map(() => '')); continue; }
      sliced.push(colIndices.map((ci) => row[ci - 1] ?? ''));
    }

    if (sliced.length === 0) return { headers: [], rows: [] };

    // First row of selection = headers
    const headers = sliced[0]!.map((h, i) => h.trim() || `Col ${colIndices[i] ?? i + 1}`);
    const rows = sliced.slice(1).filter((row) => row.some((c) => c.trim()));

    return { headers, rows };
  }

  /**
   * Save: create a broker with the given name, insert holdings from the mapped data.
   */
  async saveAsBroker(
    uploadId: string,
    userId: string,
    brokerName: string,
    columnMapping: { ticker: number; qty: number; avgCost: number }, // 0-based column indices
    data: ExtractedData,
  ): Promise<{ brokerId: string; holdingsCreated: number }> {
    const session = this.getSession(uploadId, userId);
    if (!session) throw new Error('Upload session expired or not found');

    return this.db.withUserTx(userId, async (tx) => {
      // Create or find broker
      const existingBroker = await tx.query<{ id: string }>(
        `SELECT id FROM broker WHERE user_id = $1 AND display_name = $2 AND deleted_at IS NULL`,
        [userId, brokerName],
      );
      let brokerId: string;
      if (existingBroker.rows.length > 0) {
        brokerId = existingBroker.rows[0]!.id;
      } else {
        const maxPos = await tx.query<{ max: number | null }>(
          `SELECT COALESCE(MAX(sort_order), 0) AS max FROM broker WHERE user_id = $1`,
          [userId],
        );
        const pos = (maxPos.rows[0]!.max ?? 0) + 1;
        const ins = await tx.query<{ id: string }>(
          `INSERT INTO broker (user_id, name, display_name, sort_order)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [userId, brokerName.toLowerCase().replace(/\s+/g, '_'), brokerName, pos],
        );
        brokerId = ins.rows[0]!.id;
      }

      // Insert holdings
      let created = 0;
      for (const row of data.rows) {
        const ticker = (row[columnMapping.ticker] ?? '').trim().toUpperCase();
        const qtyStr = (row[columnMapping.qty] ?? '').replace(/,/g, '').trim();
        const avgStr = (row[columnMapping.avgCost] ?? '').replace(/,/g, '').trim();

        if (!ticker || !qtyStr) continue;
        const qty = parseFloat(qtyStr);
        const avg = parseFloat(avgStr) || 0;
        if (isNaN(qty) || qty <= 0) continue;

        await tx.query(
          `INSERT INTO holding (user_id, broker_id, ticker, qty, avg_cost)
           VALUES ($1, $2, $3, $4::numeric, $5::numeric)
           ON CONFLICT ON CONSTRAINT holding_pkey DO UPDATE
              SET qty = EXCLUDED.qty, avg_cost = EXCLUDED.avg_cost`,
          [userId, brokerId, ticker, qty, avg],
        );
        created++;
      }

      // Clean up session after successful save
      this.sessions.delete(uploadId);

      return { brokerId, holdingsCreated: created };
    });
  }

  /**
   * Save with new schema: portfolio → broker → holdings (dual-ticker).
   * Also persists transform rules with the broker.
   */
  async saveWithNewSchema(
    uploadId: string,
    userId: string,
    brokerName: string,
    exchangeDefault: string,
    columnMapping: { ticker: number; qty: number; avgCost: number },
    transformRules: Array<{ kind: string; config: Record<string, unknown> }>,
    data: ExtractedData,
    tickerMap: Array<{ source: string; resolved: string }>,
  ): Promise<{ portfolioId: string; brokerId: string; holdingsCreated: number }> {
    const session = this.getSession(uploadId, userId);
    if (!session) throw new Error('Upload session expired or not found');

    // Import the transform service logic inline (apply rules to tickers)
    const applyRules = (source: string): string => {
      let result = source.trim();
      for (const rule of transformRules) {
        switch (rule.kind) {
          case 'UPPERCASE': result = result.toUpperCase(); break;
          case 'STRIP_PREFIX':
            for (const p of ((rule.config['prefixes'] as string[]) ?? []))
              if (result.startsWith(p)) { result = result.slice(p.length); break; }
            break;
          case 'STRIP_SUFFIX':
            for (const s of ((rule.config['suffixes'] as string[]) ?? []))
              if (result.endsWith(s)) { result = result.slice(0, -s.length); break; }
            break;
          case 'APPEND_SUFFIX': {
            const suffix = (rule.config['suffix'] as string) ?? '';
            if (suffix && !result.endsWith(suffix)) result += suffix;
            break;
          }
          case 'REGEX_REPLACE': {
            const pattern = rule.config['pattern'] as string;
            const replacement = (rule.config['replacement'] as string) ?? '';
            if (pattern) try { result = result.replace(new RegExp(pattern), replacement); } catch { /* skip */ }
            break;
          }
        }
      }
      return result;
    };

    return this.db.withUserTx(userId, async (tx) => {
      // 1. Ensure user has a default portfolio
      let portfolioId: string;
      const existingPortfolio = await tx.query<{ id: string }>(
        `SELECT id FROM portfolio WHERE user_id = $1 LIMIT 1`,
        [userId],
      );
      if (existingPortfolio.rows.length > 0) {
        portfolioId = existingPortfolio.rows[0]!.id;
      } else {
        const pIns = await tx.query<{ id: string }>(
          `INSERT INTO portfolio (user_id, name) VALUES ($1, 'My Portfolio') RETURNING id`,
          [userId],
        );
        portfolioId = pIns.rows[0]!.id;
      }

      // 2. Create or find broker
      const slug = brokerName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const existingBroker = await tx.query<{ id: string }>(
        `SELECT id FROM broker WHERE user_id = $1 AND portfolio_id = $2 AND name = $3 AND deleted_at IS NULL`,
        [userId, portfolioId, slug],
      );
      let brokerId: string;
      if (existingBroker.rows.length > 0) {
        brokerId = existingBroker.rows[0]!.id;
      } else {
        const maxPos = await tx.query<{ max: number | null }>(
          `SELECT COALESCE(MAX(sort_order), 0) AS max FROM broker WHERE user_id = $1`,
          [userId],
        );
        const pos = (maxPos.rows[0]!.max ?? 0) + 1;
        const bIns = await tx.query<{ id: string }>(
          `INSERT INTO broker (user_id, portfolio_id, name, display_name, exchange_default, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [userId, portfolioId, slug, brokerName, exchangeDefault, pos],
        );
        brokerId = bIns.rows[0]!.id;
      }

      // 3. Save transform rules for this broker (replace existing)
      await tx.query(`DELETE FROM ticker_transform_rule WHERE broker_id = $1 AND user_id = $2`, [brokerId, userId]);
      for (let i = 0; i < transformRules.length; i++) {
        const rule = transformRules[i]!;
        await tx.query(
          `INSERT INTO ticker_transform_rule (broker_id, user_id, priority, kind, config)
           VALUES ($1, $2, $3, $4, $5)`,
          [brokerId, userId, i, rule.kind, JSON.stringify(rule.config)],
        );
      }

      // 4. Insert holdings with dual-ticker
      // tickerMap is the authoritative source→resolved mapping from Step 4 (user's final edits)
      // It's indexed by row order (tickerMap[0] = first data row, etc.)
      // Build a lookup: original source (from Excel) → user's final resolved ticker
      const resolvedLookup = new Map<string, string>();
      for (const entry of tickerMap) {
        resolvedLookup.set(entry.source.trim(), entry.resolved.trim());
      }

      let created = 0;
      for (const row of data.rows) {
        const rawTicker = (row[columnMapping.ticker] ?? '').trim();
        const qtyStr = (row[columnMapping.qty] ?? '').replace(/,/g, '').trim();
        const avgStr = (row[columnMapping.avgCost] ?? '').replace(/,/g, '').trim();

        if (!rawTicker || !qtyStr) continue;
        const qty = parseFloat(qtyStr);
        const avg = parseFloat(avgStr) || 0;
        if (isNaN(qty) || qty <= 0) continue;

        // Use the user's final resolved ticker from tickerMap; fall back to rules
        const resolvedTicker = resolvedLookup.get(rawTicker) ?? applyRules(rawTicker);
        // source_ticker = resolved_ticker (we store the Yahoo-compatible ticker as the canonical)
        const sourceTicker = resolvedTicker;

        await tx.query(
          `INSERT INTO holding (user_id, broker_id, source_ticker, resolved_ticker, qty, avg_cost)
           VALUES ($1, $2, $3, $4, $5::numeric, $6::numeric)
           ON CONFLICT (user_id, broker_id, source_ticker) DO UPDATE
              SET resolved_ticker = EXCLUDED.resolved_ticker,
                  qty = EXCLUDED.qty,
                  avg_cost = EXCLUDED.avg_cost`,
          [userId, brokerId, sourceTicker, resolvedTicker, qty, avg],
        );
        created++;
      }

      // Clean up session after successful save
      this.sessions.delete(uploadId);

      return { portfolioId, brokerId, holdingsCreated: created };
    });
  }

  private getSession(uploadId: string, userId: string): UploadSession | null {
    const s = this.sessions.get(uploadId);
    if (!s || s.userId !== userId) return null;
    if (Date.now() - s.createdAt > UploadService.SESSION_TTL_MS) {
      this.sessions.delete(uploadId);
      return null;
    }
    return s;
  }

  private cellToString(cell: ExcelJS.Cell): string {
    if (cell.value === null || cell.value === undefined) return '';
    if (typeof cell.value === 'object') {
      if ('result' in cell.value) return String((cell.value as { result: unknown }).result ?? '');
      if ('text' in cell.value) return String((cell.value as { text: string }).text);
      if (cell.value instanceof Date) return cell.value.toISOString().slice(0, 10);
      return String(cell.value);
    }
    return String(cell.value);
  }

  private generateId(): string {
    return `upl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private cleanup() {
    const now = Date.now();
    for (const [id, s] of this.sessions) {
      if (now - s.createdAt > UploadService.SESSION_TTL_MS) {
        this.sessions.delete(id);
      }
    }
  }
}
