import { Injectable } from '@nestjs/common';
import { DbService } from '@tickernest/common';

export interface UsHoldingRow {
  id: string;
  user_id: string;
  ticker: string;
  name: string | null;
  sector: string | null;
  qty: string;
  avg_cost_usd: string;
  lot_kind: string;
  broker_name: string | null;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class UsRepository {
  constructor(private readonly db: DbService) {}

  async findAllByUser(userId: string): Promise<UsHoldingRow[]> {
    const { rows } = await this.db.query<UsHoldingRow>(
      `SELECT * FROM us_holding WHERE user_id = $1 ORDER BY ticker`,
      [userId],
    );
    return rows;
  }

  async findById(userId: string, id: string): Promise<UsHoldingRow | null> {
    const { rows } = await this.db.query<UsHoldingRow>(
      `SELECT * FROM us_holding WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    return rows[0] ?? null;
  }

  async create(userId: string, data: {
    ticker: string;
    name?: string;
    sector?: string;
    qty: string;
    avgCostUsd: string;
    lotKind: string;
    brokerName?: string;
  }): Promise<UsHoldingRow> {
    const { rows } = await this.db.query<UsHoldingRow>(
      `INSERT INTO us_holding (user_id, ticker, name, sector, qty, avg_cost_usd, lot_kind, broker_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id, ticker, lot_kind, broker_name)
       DO UPDATE SET name = EXCLUDED.name, sector = EXCLUDED.sector,
                     qty = EXCLUDED.qty, avg_cost_usd = EXCLUDED.avg_cost_usd,
                     updated_at = NOW()
       RETURNING *`,
      [userId, data.ticker, data.name ?? null, data.sector ?? null,
       data.qty, data.avgCostUsd, data.lotKind, data.brokerName ?? null],
    );
    return rows[0]!;
  }

  async update(userId: string, id: string, data: {
    qty?: string;
    avgCostUsd?: string;
    name?: string;
  }): Promise<UsHoldingRow | null> {
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (data.qty !== undefined) { sets.push(`qty = $${idx++}`); params.push(data.qty); }
    if (data.avgCostUsd !== undefined) { sets.push(`avg_cost_usd = $${idx++}`); params.push(data.avgCostUsd); }
    if (data.name !== undefined) { sets.push(`name = $${idx++}`); params.push(data.name); }

    if (sets.length === 0) return this.findById(userId, id);

    sets.push(`updated_at = NOW()`);
    params.push(id, userId);

    const { rows } = await this.db.query<UsHoldingRow>(
      `UPDATE us_holding SET ${sets.join(', ')} WHERE id = $${idx++} AND user_id = $${idx} RETURNING *`,
      params,
    );
    return rows[0] ?? null;
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.db.query(
      `DELETE FROM us_holding WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    return (rowCount ?? 0) > 0;
  }
}
