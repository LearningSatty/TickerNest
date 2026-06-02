/**
 * HoldingRepository — applies a Plan from `planHoldingUpsert` against
 * Postgres inside a single TX. RLS gives us per-user isolation; we still
 * pass userId explicitly so the WHERE clause is correct on every statement.
 */
import { Injectable } from '@nestjs/common';
import { D, Money } from '../common/types/money';
import { DbService, Tx } from '../common/db.service';
import { PgIdempotencyStore } from '../common/idempotency.pg';
import {
  HoldingState,
  Plan,
  PlannedSoldShare,
  planHoldingUpsert,
} from './holding.upsert';

export interface HoldingRowDb {
  user_id: string;
  broker_id: string;
  ticker: string;
  qty: string;       // pg returns NUMERIC as string
  avg_cost: string;
  created_at: Date;
  updated_at: Date;
}

export interface UpsertResult {
  replay: boolean;
  holding: HoldingRowDb | null; // null when DELETE'd (qty=0 retained → still present, in fact)
  soldShareId: string | null;
}

@Injectable()
export class HoldingRepository {
  constructor(
    private readonly db: DbService,
    private readonly idem: PgIdempotencyStore,
  ) {}

  async listForBroker(userId: string, brokerId: string): Promise<HoldingRowDb[]> {
    return this.db.withUserTx(userId, async (tx) => {
      const r = await tx.query<HoldingRowDb>(
        `SELECT * FROM holding
          WHERE user_id = $1 AND broker_id = $2
          ORDER BY ticker`,
        [userId, brokerId],
      );
      return r.rows;
    });
  }

  async upsert(
    userId: string,
    idempotencyKey: string,
    brokerId: string,
    ticker: string,
    desired: HoldingState,
    sellMeta: { soldPrice?: Money; reason?: string; mistake?: string } = {},
  ): Promise<UpsertResult> {
    return this.db.withUserTx(userId, async (tx) => {
      // 1. Idempotency lookup inside the same TX.
      const prior = await this.idem.lookup(userId, idempotencyKey, tx);
      if (prior) {
        const existing = await this.fetchHolding(tx, userId, brokerId, ticker);
        return { replay: true, holding: existing, soldShareId: null };
      }

      // 2. Lock the current row (FOR UPDATE) and read its qty/avg.
      const cur = await tx.query<{ qty: string; avg_cost: string }>(
        `SELECT qty, avg_cost FROM holding
          WHERE user_id = $1 AND broker_id = $2 AND ticker = $3
          FOR UPDATE`,
        [userId, brokerId, ticker],
      );
      const current: HoldingState | null =
        cur.rowCount === 0
          ? null
          : { qty: D(cur.rows[0]!.qty), avgCost: D(cur.rows[0]!.avg_cost) };

      // 3. Run the pure planner.
      const plan = planHoldingUpsert(current, {
        desired,
        ...(sellMeta.soldPrice !== undefined && { soldPrice: sellMeta.soldPrice }),
        ...(sellMeta.reason !== undefined && { reason: sellMeta.reason }),
        ...(sellMeta.mistake !== undefined && { mistake: sellMeta.mistake }),
      });

      // 4. Apply.
      let soldShareId: string | null = null;
      let result: HoldingRowDb | null = null;

      switch (plan.kind) {
        case 'NOOP':
          result = await this.fetchHolding(tx, userId, brokerId, ticker);
          break;
        case 'INSERT':
          result = await this.insert(tx, userId, brokerId, ticker, plan.next);
          await this.writeAudit(tx, userId, brokerId, ticker, null, plan.next);
          break;
        case 'UPDATE':
          result = await this.updateRow(
            tx, userId, brokerId, ticker, plan.next,
          );
          await this.writeAudit(tx, userId, brokerId, ticker, current, plan.next);
          if (plan.soldShare)
            soldShareId = await this.insertSoldShare(
              tx, userId, brokerId, ticker, plan.soldShare,
            );
          break;
        case 'DELETE':
          // qty=0 retention: we DON'T delete the row, we set qty=0 and keep avg_cost.
          // The (user,broker,ticker) PK is preserved, history stays in holding_audit.
          result = await this.updateRow(tx, userId, brokerId, ticker, {
            qty: D(0),
            avgCost: current!.avgCost, // keep last avg as-is
          });
          await this.writeAudit(tx, userId, brokerId, ticker, current, {
            qty: D(0),
            avgCost: current!.avgCost,
          });
          soldShareId = await this.insertSoldShare(
            tx, userId, brokerId, ticker, plan.soldShare,
          );
          break;
      }

      // 5. Record idempotency in same TX.
      const recordId = result ? `${result.user_id}:${result.broker_id}:${result.ticker}` : '';
      await this.idem.record(
        userId, idempotencyKey, recordId, 'PUT /holdings', tx,
      );

      return { replay: false, holding: result, soldShareId };
    });
  }

  private async fetchHolding(
    tx: Tx, userId: string, brokerId: string, ticker: string,
  ): Promise<HoldingRowDb | null> {
    const r = await tx.query<HoldingRowDb>(
      `SELECT * FROM holding
        WHERE user_id = $1 AND broker_id = $2 AND ticker = $3`,
      [userId, brokerId, ticker],
    );
    return r.rowCount === 0 ? null : r.rows[0]!;
  }

  private async insert(
    tx: Tx, userId: string, brokerId: string, ticker: string, next: HoldingState,
  ): Promise<HoldingRowDb> {
    const r = await tx.query<HoldingRowDb>(
      `INSERT INTO holding (user_id, broker_id, ticker, qty, avg_cost)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, brokerId, ticker, next.qty.toFixed(4), next.avgCost.toFixed(4)],
    );
    return r.rows[0]!;
  }

  private async updateRow(
    tx: Tx, userId: string, brokerId: string, ticker: string, next: HoldingState,
  ): Promise<HoldingRowDb> {
    const r = await tx.query<HoldingRowDb>(
      `UPDATE holding SET qty = $4, avg_cost = $5
        WHERE user_id = $1 AND broker_id = $2 AND ticker = $3
        RETURNING *`,
      [userId, brokerId, ticker, next.qty.toFixed(4), next.avgCost.toFixed(4)],
    );
    return r.rows[0]!;
  }

  private async writeAudit(
    tx: Tx, userId: string, brokerId: string, ticker: string,
    before: HoldingState | null,
    after: HoldingState,
  ): Promise<void> {
    await tx.query(
      `INSERT INTO holding_audit
        (user_id, broker_id, ticker, before_qty, before_avg_cost,
         after_qty, after_avg_cost, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'MANUAL')`,
      [
        userId, brokerId, ticker,
        before ? before.qty.toFixed(4) : null,
        before ? before.avgCost.toFixed(4) : null,
        after.qty.toFixed(4),
        after.avgCost.toFixed(4),
      ],
    );
  }

  private async insertSoldShare(
    tx: Tx, userId: string, brokerId: string, ticker: string,
    s: PlannedSoldShare,
  ): Promise<string> {
    const r = await tx.query<{ id: string }>(
      `INSERT INTO sold_share
        (user_id, broker_id, ticker, qty, cost_basis_at_sell,
         sold_price, reason, mistake, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'MANUAL')
       RETURNING id`,
      [
        userId, brokerId, ticker,
        s.qty.toFixed(4),
        s.costBasisAtSell.toFixed(4),
        s.soldPrice ? s.soldPrice.toFixed(4) : null,
        s.reason,
        s.mistake,
      ],
    );
    return r.rows[0]!.id;
  }
}
