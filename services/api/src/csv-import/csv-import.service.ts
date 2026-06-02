import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { D, Money } from '../common/types/money';
import { DbService, Tx } from '../common/db.service';
import { BUILT_IN_PROFILES, BrokerCsvProfile } from '../common/providers/csv-profile';
import { parseCsv } from './csv.parser';
import { computeImportDiff, CurrentHolding, DiffMode, DiffSummary } from './import.diff';

interface CsvImportRow {
  id: string;
  user_id: string;
  broker_id: string;
  status: string;
  diff_preview: DiffSummary | null;
  rows_total: number | null;
  rows_rejected: number | null;
  rejected_rows: { rowIndex: number; reason: string }[] | null;
}

@Injectable()
export class CsvImportService {
  private readonly log = new Logger(CsvImportService.name);
  constructor(private readonly db: DbService) {}

  async preview(
    userId: string,
    brokerId: string,
    _idemKey: string,
    file: Buffer,
  ) {
    const fileHash = sha256(file);
    return this.db.withUserTx(userId, async (tx) => {
      // Confirm broker is the user's
      const b = await tx.query<{ csv_profile_key: string; csv_profile: BrokerCsvProfile | null }>(
        `SELECT csv_profile_key, csv_profile
           FROM broker
          WHERE user_id = $1 AND id = $2 AND deleted_at IS NULL`,
        [userId, brokerId],
      );
      if (b.rowCount === 0) throw new NotFoundException('broker');
      const profile = (b.rows[0]!.csv_profile
        ?? BUILT_IN_PROFILES[b.rows[0]!.csv_profile_key as keyof typeof BUILT_IN_PROFILES]
        ?? BUILT_IN_PROFILES.custom);

      // Replay path: same file already uploaded → return that import row.
      const replay = await tx.query<CsvImportRow>(
        `SELECT id, user_id, broker_id, status, diff_preview, rows_total, rows_rejected, rejected_rows
           FROM csv_import
          WHERE user_id = $1 AND broker_id = $2 AND file_hash = $3`,
        [userId, brokerId, fileHash],
      );
      if ((replay.rowCount ?? 0) > 0) {
        const r = replay.rows[0]!;
        return this.responseFromImport(r);
      }

      // Parse + diff
      const parsed = parseCsv(file.toString('utf-8'), profile);
      const cur = await this.fetchCurrentHoldings(tx, userId, brokerId);
      const diff = computeImportDiff(
        cur,
        parsed.rows.map((r) => ({ ticker: r.ticker, qty: r.qty, avgCost: r.avgCost })),
        'REPLACE',  // mode chosen at commit; we always *preview* under REPLACE
      );

      const ins = await tx.query<{ id: string }>(
        `INSERT INTO csv_import
           (user_id, broker_id, file_hash, status, profile_used,
            rows_total, rows_rejected, diff_preview, rejected_rows)
         VALUES ($1, $2, $3, 'PREVIEW', $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          userId, brokerId, fileHash, profile.brokerKey,
          parsed.totalRows, parsed.rejected.length,
          JSON.stringify(serialiseDiff(diff)),
          JSON.stringify(parsed.rejected),
        ],
      );
      return {
        importId: ins.rows[0]!.id,
        adds: diff.adds,
        updates: diff.updates,
        unchanged: diff.unchanged,
        removes: diff.removes,
        rejected: parsed.rejected.length,
        rows: serialiseDiff(diff).rows,
      };
    });
  }

  async commit(userId: string, importId: string, mode: DiffMode) {
    return this.db.withUserTx(userId, async (tx) => {
      const r = await tx.query<CsvImportRow & { broker_id: string }>(
        `SELECT id, user_id, broker_id, status, diff_preview, rows_total, rows_rejected, rejected_rows
           FROM csv_import
          WHERE user_id = $1 AND id = $2 FOR UPDATE`,
        [userId, importId],
      );
      if (r.rowCount === 0) throw new NotFoundException('import');
      const imp = r.rows[0]!;
      if (imp.status === 'COMMITTED')
        throw new BadRequestException('already committed');

      // Defensively re-diff against the latest holdings.
      const cur = await this.fetchCurrentHoldings(tx, userId, imp.broker_id);
      const previewRows = (imp.diff_preview as unknown as ReturnType<typeof serialiseDiff>)?.rows ?? [];
      const staged = previewRows
        .filter((row) => row.kind !== 'REMOVE' && row.staged)
        .map((row) => ({
          ticker: row.ticker,
          qty: D(row.staged!.qty),
          avgCost: D(row.staged!.avgCost),
        }));
      const diff = computeImportDiff(cur, staged, mode);

      let applied = 0;
      let soldShares = 0;
      for (const row of diff.rows) {
        if (row.kind === 'UNCHANGED') continue;
        if (row.kind === 'ADD') {
          await tx.query(
            `INSERT INTO holding (user_id, broker_id, ticker, qty, avg_cost)
             VALUES ($1, $2, $3, $4, $5)`,
            [userId, imp.broker_id, row.ticker, row.staged!.qty.toFixed(4), row.staged!.avgCost.toFixed(4)],
          );
          await this.audit(tx, userId, imp.broker_id, row.ticker,
            null, null, row.staged!.qty.toFixed(4), row.staged!.avgCost.toFixed(4),
            'CSV', importId);
          applied++;
        } else if (row.kind === 'UPDATE') {
          const oldQty = row.current!.qty;
          const oldAvg = row.current!.avgCost;
          const newQty = row.staged!.qty;
          const newAvg = row.staged!.avgCost;
          await tx.query(
            `UPDATE holding SET qty = $4, avg_cost = $5
              WHERE user_id = $1 AND broker_id = $2 AND ticker = $3`,
            [userId, imp.broker_id, row.ticker, newQty.toFixed(4), newAvg.toFixed(4)],
          );
          await this.audit(tx, userId, imp.broker_id, row.ticker,
            oldQty.toFixed(4), oldAvg.toFixed(4),
            newQty.toFixed(4), newAvg.toFixed(4), 'CSV', importId);
          if (newQty.lt(oldQty)) {
            await tx.query(
              `INSERT INTO sold_share
                 (user_id, broker_id, ticker, qty, cost_basis_at_sell, source, source_ref_id)
               VALUES ($1, $2, $3, $4, $5, 'CSV', $6)`,
              [userId, imp.broker_id, row.ticker,
                oldQty.sub(newQty).toFixed(4), oldAvg.toFixed(4), importId],
            );
            soldShares++;
          }
          applied++;
        } else if (row.kind === 'REMOVE') {
          // qty=0 retention: keep the row at qty=0, preserve last avg.
          await tx.query(
            `UPDATE holding SET qty = 0
              WHERE user_id = $1 AND broker_id = $2 AND ticker = $3`,
            [userId, imp.broker_id, row.ticker],
          );
          await tx.query(
            `INSERT INTO sold_share
               (user_id, broker_id, ticker, qty, cost_basis_at_sell, source, source_ref_id)
             VALUES ($1, $2, $3, $4, $5, 'CSV', $6)`,
            [userId, imp.broker_id, row.ticker,
              row.current!.qty.toFixed(4), row.current!.avgCost.toFixed(4), importId],
          );
          await this.audit(tx, userId, imp.broker_id, row.ticker,
            row.current!.qty.toFixed(4), row.current!.avgCost.toFixed(4),
            '0', row.current!.avgCost.toFixed(4), 'CSV', importId);
          soldShares++;
          applied++;
        }
      }
      await tx.query(
        `UPDATE csv_import SET status = 'COMMITTED', rows_applied = $3 WHERE user_id = $1 AND id = $2`,
        [userId, importId, applied],
      );
      return { rowsApplied: applied, soldSharesCreated: soldShares };
    });
  }

  // ---------------------------------------------------------------------- helpers

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
      ticker: row.ticker,
      qty: D(row.qty),
      avgCost: D(row.avg_cost),
    }));
  }

  private async audit(
    tx: Tx, userId: string, brokerId: string, ticker: string,
    beforeQty: string | null, beforeAvg: string | null,
    afterQty: string, afterAvg: string,
    source: string, refId: string,
  ) {
    await tx.query(
      `INSERT INTO holding_audit
        (user_id, broker_id, ticker, before_qty, before_avg_cost,
         after_qty, after_avg_cost, source, source_ref_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [userId, brokerId, ticker, beforeQty, beforeAvg, afterQty, afterAvg, source, refId],
    );
  }

  private responseFromImport(r: CsvImportRow) {
    const diff = (r.diff_preview as unknown as ReturnType<typeof serialiseDiff>) ?? { rows: [], adds: 0, updates: 0, unchanged: 0, removes: 0 };
    return {
      importId: r.id,
      adds: diff.adds,
      updates: diff.updates,
      unchanged: diff.unchanged,
      removes: diff.removes,
      rejected: r.rows_rejected ?? 0,
      rows: diff.rows,
    };
  }
}

function serialiseDiff(d: DiffSummary) {
  return {
    adds: d.adds,
    updates: d.updates,
    unchanged: d.unchanged,
    removes: d.removes,
    rows: d.rows.map((r) => ({
      ticker: r.ticker,
      kind: r.kind,
      current: r.current
        ? { qty: r.current.qty.toFixed(4), avgCost: r.current.avgCost.toFixed(4) }
        : null,
      staged: r.staged
        ? { qty: r.staged.qty.toFixed(4), avgCost: r.staged.avgCost.toFixed(4) }
        : null,
    })),
  };
}

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}
