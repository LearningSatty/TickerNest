import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { D } from '../common/types/money';
import { DbService, Tx } from '../common/db.service';
import { computeImportDiff, CurrentHolding } from '../csv-import/import.diff';
import { ExcelBrokerSheet, parseExcel } from './excel.parser';

export interface ExcelOnboardResult {
  excelImportId: string;
  perBroker: Array<{
    brokerId: string;
    brokerName: string;
    parsedRows: number;
    rejectedRows: number;
    adds: number;
    updates: number;
    unchanged: number;
    removes: number;
    tradesCreated: number;
  }>;
}

@Injectable()
export class ExcelImportService {
  private readonly log = new Logger(ExcelImportService.name);
  constructor(private readonly db: DbService) {}

  async onboard(
    userId: string,
    _idempotencyKey: string,
    buffer: Buffer,
  ): Promise<ExcelOnboardResult> {
    const fileHash = sha256(buffer);

    return this.db.withUserTx(userId, async (tx) => {
      // Replay path: same file already onboarded
      const replay = await tx.query<{ id: string }>(
        `SELECT id FROM excel_import WHERE user_id = $1 AND file_hash = $2`,
        [userId, fileHash],
      );
      if ((replay.rowCount ?? 0) > 0) {
        // Re-fetch the per-broker summary from csv_import children.
        const ex = replay.rows[0]!;
        return await this.summary(tx, userId, ex.id);
      }

      const ins = await tx.query<{ id: string }>(
        `INSERT INTO excel_import (user_id, file_hash, status)
         VALUES ($1, $2, 'PARSING') RETURNING id`,
        [userId, fileHash],
      );
      const excelImportId = ins.rows[0]!.id;

      // Convert Buffer to a fresh ArrayBuffer (some allocators give us a slice
      // backed by a SharedArrayBuffer; ExcelJS.xlsx.load wants ArrayBuffer).
      const ab = new ArrayBuffer(buffer.byteLength);
      new Uint8Array(ab).set(buffer);
      const sheets = await parseExcel(ab);

      const perBroker: ExcelOnboardResult['perBroker'] = [];
      for (const sheet of sheets) {
        const brokerName = sheetNameToSlug(sheet.brokerHint);
        const broker = await this.upsertBroker(tx, userId, brokerName, sheet.brokerHint);
        const cur = await this.fetchCurrentHoldings(tx, userId, broker.id);
        const staged = sheet.rows.map((r) => ({
          ticker: r.ticker, qty: r.qty, avgCost: r.avgCost,
        }));
        const diff = computeImportDiff(cur, staged, 'REPLACE');

        // Per-sheet child csv_import row for traceability.
        const childIns = await tx.query<{ id: string }>(
          `INSERT INTO csv_import
            (user_id, broker_id, excel_import_id, file_hash, status,
             profile_used, rows_total, rows_rejected)
           VALUES ($1, $2, $3, $4, 'COMMITTED', 'excel', $5, $6)
           RETURNING id`,
          [userId, broker.id, excelImportId, fileHash + ':' + brokerName,
           sheet.rows.length, sheet.rejected.length],
        );
        const childImportId = childIns.rows[0]!.id;

        let applied = 0;
        for (const row of diff.rows) {
          if (row.kind === 'UNCHANGED') continue;
          if (row.kind === 'ADD') {
            await tx.query(
              `INSERT INTO holding (user_id, broker_id, ticker, qty, avg_cost)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT (user_id, broker_id, ticker)
               DO UPDATE SET qty = EXCLUDED.qty, avg_cost = EXCLUDED.avg_cost`,
              [userId, broker.id, row.ticker,
                row.staged!.qty.toFixed(4), row.staged!.avgCost.toFixed(4)],
            );
            applied++;
          } else if (row.kind === 'UPDATE') {
            await tx.query(
              `UPDATE holding SET qty = $4, avg_cost = $5
                WHERE user_id = $1 AND broker_id = $2 AND ticker = $3`,
              [userId, broker.id, row.ticker,
                row.staged!.qty.toFixed(4), row.staged!.avgCost.toFixed(4)],
            );
            if (row.staged!.qty.lt(row.current!.qty)) {
              await tx.query(
                `INSERT INTO sold_share
                  (user_id, broker_id, ticker, qty, cost_basis_at_sell, source, source_ref_id)
                 VALUES ($1, $2, $3, $4, $5, 'EXCEL', $6)`,
                [userId, broker.id, row.ticker,
                  row.current!.qty.sub(row.staged!.qty).toFixed(4),
                  row.current!.avgCost.toFixed(4), childImportId],
              );
            }
            applied++;
          } else if (row.kind === 'REMOVE') {
            await tx.query(
              `UPDATE holding SET qty = 0
                WHERE user_id = $1 AND broker_id = $2 AND ticker = $3`,
              [userId, broker.id, row.ticker],
            );
            await tx.query(
              `INSERT INTO sold_share
                (user_id, broker_id, ticker, qty, cost_basis_at_sell, source, source_ref_id)
               VALUES ($1, $2, $3, $4, $5, 'EXCEL', $6)`,
              [userId, broker.id, row.ticker,
                row.current!.qty.toFixed(4),
                row.current!.avgCost.toFixed(4), childImportId],
            );
            applied++;
          }
        }
        await tx.query(
          `UPDATE csv_import SET rows_applied = $2 WHERE id = $1`,
          [childImportId, applied],
        );
        perBroker.push({
          brokerId: broker.id,
          brokerName: sheet.brokerHint,
          parsedRows: sheet.rows.length,
          rejectedRows: sheet.rejected.length,
          adds: diff.adds,
          updates: diff.updates,
          unchanged: diff.unchanged,
          removes: diff.removes,
          tradesCreated: applied,
        });
      }

      await tx.query(
        `UPDATE excel_import SET status='COMMITTED', rows_total=$2, rows_applied=$3
          WHERE id = $1`,
        [excelImportId,
         perBroker.reduce((a, b) => a + b.parsedRows, 0),
         perBroker.reduce((a, b) => a + b.tradesCreated, 0)],
      );
      return { excelImportId, perBroker };
    });
  }

  // ---------------------------------------------------------------------- helpers

  private async upsertBroker(
    tx: Tx, userId: string, slug: string, displayName: string,
  ): Promise<{ id: string }> {
    const found = await tx.query<{ id: string }>(
      `SELECT id FROM broker WHERE user_id = $1 AND name = $2`,
      [userId, slug],
    );
    if ((found.rowCount ?? 0) > 0) return found.rows[0]!;
    const max = await tx.query<{ max: number | null }>(
      `SELECT COALESCE(MAX(sort_order), 0) AS max FROM broker WHERE user_id = $1`,
      [userId],
    );
    const ins = await tx.query<{ id: string }>(
      `INSERT INTO broker (user_id, name, display_name, currency, sort_order, csv_profile_key)
       VALUES ($1, $2, $3, 'INR', $4, 'custom')
       RETURNING id`,
      [userId, slug, displayName, (max.rows[0]!.max ?? 0) + 1],
    );
    return ins.rows[0]!;
  }

  private async fetchCurrentHoldings(
    tx: Tx, userId: string, brokerId: string,
  ): Promise<CurrentHolding[]> {
    const r = await tx.query<{ ticker: string; qty: string; avg_cost: string }>(
      `SELECT ticker, qty::text AS qty, avg_cost::text AS avg_cost
         FROM holding
        WHERE user_id = $1 AND broker_id = $2 AND qty > 0`,
      [userId, brokerId],
    );
    return r.rows.map((row) => ({
      ticker: row.ticker, qty: D(row.qty), avgCost: D(row.avg_cost),
    }));
  }

  private async summary(
    tx: Tx, userId: string, excelImportId: string,
  ): Promise<ExcelOnboardResult> {
    const r = await tx.query<{
      broker_id: string; display_name: string;
      rows_total: number; rows_rejected: number; rows_applied: number;
    }>(
      `SELECT ci.broker_id, b.display_name,
              ci.rows_total, ci.rows_rejected, ci.rows_applied
         FROM csv_import ci JOIN broker b ON b.id = ci.broker_id
        WHERE ci.user_id = $1 AND ci.excel_import_id = $2`,
      [userId, excelImportId],
    );
    return {
      excelImportId,
      perBroker: r.rows.map((x) => ({
        brokerId: x.broker_id,
        brokerName: x.display_name,
        parsedRows: x.rows_total,
        rejectedRows: x.rows_rejected,
        adds: 0, updates: 0, unchanged: 0, removes: 0,
        tradesCreated: x.rows_applied,
      })),
    };
  }

  // Exposed for unit tests (Step 3 era).
  computeDiffsForOnboarding(
    sheets: readonly ExcelBrokerSheet[],
    currentByBroker: ReadonlyMap<string, readonly CurrentHolding[]>,
  ) {
    return sheets.map((sheet) => {
      const current = currentByBroker.get(sheet.brokerHint) ?? [];
      const diff = computeImportDiff(
        current,
        sheet.rows.map((r) => ({ ticker: r.ticker, qty: r.qty, avgCost: r.avgCost })),
        'REPLACE',
      );
      return { brokerHint: sheet.brokerHint, diff, rejected: sheet.rejected.length };
    });
  }
}

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

function sheetNameToSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
