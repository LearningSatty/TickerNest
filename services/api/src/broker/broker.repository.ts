import { Injectable } from '@nestjs/common';
import { DbService } from '../common/db.service';

export interface BrokerRow {
  id: string;
  user_id: string;
  name: string;
  display_name: string;
  currency: 'INR' | 'USD';
  sort_order: number;
  exchange_default: string;
}

export interface CreateBrokerInput {
  name: string;
  displayName: string;
  currency: 'INR' | 'USD';
  exchangeDefault?: string;
}

@Injectable()
export class BrokerRepository {
  constructor(private readonly db: DbService) {}

  async list(userId: string): Promise<BrokerRow[]> {
    return this.db.withUserTx(userId, async (tx) => {
      const r = await tx.query<BrokerRow>(
        `SELECT id, user_id, name, display_name, currency, sort_order, exchange_default
           FROM broker
          WHERE user_id = $1 AND deleted_at IS NULL
          ORDER BY sort_order, display_name`,
        [userId],
      );
      return r.rows;
    });
  }

  async create(userId: string, input: CreateBrokerInput): Promise<BrokerRow> {
    return this.db.withUserTx(userId, async (tx) => {
      // Ensure user has a default portfolio
      let portfolioId: string;
      const ep = await tx.query<{ id: string }>(`SELECT id FROM portfolio WHERE user_id = $1 LIMIT 1`, [userId]);
      if (ep.rows.length > 0) {
        portfolioId = ep.rows[0]!.id;
      } else {
        const pi = await tx.query<{ id: string }>(`INSERT INTO portfolio (user_id, name) VALUES ($1, 'My Portfolio') RETURNING id`, [userId]);
        portfolioId = pi.rows[0]!.id;
      }
      const max = await tx.query<{ max: number | null }>(
        `SELECT COALESCE(MAX(sort_order), 0) AS max FROM broker WHERE user_id = $1`,
        [userId],
      );
      const nextOrder = (max.rows[0]!.max ?? 0) + 1;
      const r = await tx.query<BrokerRow>(
        `INSERT INTO broker
            (user_id, portfolio_id, name, display_name, currency, sort_order, exchange_default)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, user_id, name, display_name, currency, sort_order, exchange_default`,
        [userId, portfolioId, input.name, input.displayName, input.currency, nextOrder, input.exchangeDefault ?? 'NSE'],
      );
      return r.rows[0]!;
    });
  }

  async update(
    userId: string,
    id: string,
    patch: {
      displayName?: string | undefined;
      currency?: 'INR' | 'USD' | undefined;
      exchangeDefault?: string | undefined;
      sortOrder?: number | undefined;
    },
  ): Promise<BrokerRow | null> {
    return this.db.withUserTx(userId, async (tx) => {
      const fields: string[] = [];
      const params: unknown[] = [userId, id];
      let i = 3;
      if (patch.displayName !== undefined) { fields.push(`display_name = $${i++}`); params.push(patch.displayName); }
      if (patch.currency !== undefined)    { fields.push(`currency = $${i++}`); params.push(patch.currency); }
      if (patch.exchangeDefault !== undefined){ fields.push(`exchange_default = $${i++}`); params.push(patch.exchangeDefault); }
      if (patch.sortOrder !== undefined)   { fields.push(`sort_order = $${i++}`); params.push(patch.sortOrder); }
      if (fields.length === 0) {
        const r = await tx.query<BrokerRow>(
          `SELECT id, user_id, name, display_name, currency, sort_order, exchange_default
             FROM broker WHERE user_id = $1 AND id = $2 AND deleted_at IS NULL`,
          [userId, id],
        );
        return r.rowCount === 0 ? null : r.rows[0]!;
      }
      const r = await tx.query<BrokerRow>(
        `UPDATE broker SET ${fields.join(', ')}
          WHERE user_id = $1 AND id = $2 AND deleted_at IS NULL
       RETURNING id, user_id, name, display_name, currency, sort_order, exchange_default`,
        params,
      );
      return r.rowCount === 0 ? null : r.rows[0]!;
    });
  }

  async softDelete(userId: string, id: string): Promise<boolean> {
    return this.db.withUserTx(userId, async (tx) => {
      const r = await tx.query(
        `UPDATE broker SET deleted_at = NOW()
          WHERE user_id = $1 AND id = $2 AND deleted_at IS NULL`,
        [userId, id],
      );
      return (r.rowCount ?? 0) > 0;
    });
  }

  async findByName(userId: string, name: string): Promise<BrokerRow | null> {
    return this.db.withUserTx(userId, async (tx) => {
      const r = await tx.query<BrokerRow>(
        `SELECT id, user_id, name, display_name, currency, sort_order, exchange_default
           FROM broker
          WHERE user_id = $1 AND name = $2 AND deleted_at IS NULL`,
        [userId, name],
      );
      return r.rowCount === 0 ? null : r.rows[0]!;
    });
  }
}
