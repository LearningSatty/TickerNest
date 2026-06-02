import { Injectable } from '@nestjs/common';
import { DbService } from '@tickernest/common';

export interface CryptoHoldingRow {
  id: string;
  user_id: string;
  coin: string;
  name: string | null;
  qty: string;
  avg_cost_inr: string;
  platform: string | null;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class CryptoRepository {
  constructor(private readonly db: DbService) {}

  async findAllByUser(userId: string): Promise<CryptoHoldingRow[]> {
    const { rows } = await this.db.query<CryptoHoldingRow>(
      `SELECT * FROM crypto_holding WHERE user_id = $1 ORDER BY coin`,
      [userId],
    );
    return rows;
  }

  async findById(userId: string, id: string): Promise<CryptoHoldingRow | null> {
    const { rows } = await this.db.query<CryptoHoldingRow>(
      `SELECT * FROM crypto_holding WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    return rows[0] ?? null;
  }

  async create(userId: string, data: {
    coin: string;
    name?: string;
    qty: string;
    avgCostInr: string;
    platform?: string;
  }): Promise<CryptoHoldingRow> {
    const { rows } = await this.db.query<CryptoHoldingRow>(
      `INSERT INTO crypto_holding (user_id, coin, name, qty, avg_cost_inr, platform)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, coin, platform)
       DO UPDATE SET name = EXCLUDED.name,
                     qty = EXCLUDED.qty, avg_cost_inr = EXCLUDED.avg_cost_inr,
                     updated_at = NOW()
       RETURNING *`,
      [userId, data.coin, data.name ?? null, data.qty, data.avgCostInr, data.platform ?? null],
    );
    return rows[0]!;
  }

  async update(userId: string, id: string, data: {
    qty?: string;
    avgCostInr?: string;
  }): Promise<CryptoHoldingRow | null> {
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (data.qty !== undefined) { sets.push(`qty = $${idx++}`); params.push(data.qty); }
    if (data.avgCostInr !== undefined) { sets.push(`avg_cost_inr = $${idx++}`); params.push(data.avgCostInr); }

    if (sets.length === 0) return this.findById(userId, id);

    sets.push(`updated_at = NOW()`);
    params.push(id, userId);

    const { rows } = await this.db.query<CryptoHoldingRow>(
      `UPDATE crypto_holding SET ${sets.join(', ')} WHERE id = $${idx++} AND user_id = $${idx} RETURNING *`,
      params,
    );
    return rows[0] ?? null;
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.db.query(
      `DELETE FROM crypto_holding WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    return (rowCount ?? 0) > 0;
  }
}
