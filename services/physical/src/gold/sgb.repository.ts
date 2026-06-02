import { Injectable } from '@nestjs/common';
import { DbService } from '@tickernest/common';

export interface SgbRow {
  id: string;
  user_id: string;
  series_name: string;
  units: string;
  purchase_nav: string;
  purchase_date: string;
  maturity_date: string;
  coupon_rate: string;
  broker: string | null;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class SgbRepository {
  constructor(private readonly db: DbService) {}

  async findAllByUser(userId: string): Promise<SgbRow[]> {
    const { rows } = await this.db.query<SgbRow>(
      `SELECT * FROM sgb_holding WHERE user_id = $1 ORDER BY purchase_date DESC`,
      [userId],
    );
    return rows;
  }

  async findById(userId: string, id: string): Promise<SgbRow | null> {
    const { rows } = await this.db.query<SgbRow>(
      `SELECT * FROM sgb_holding WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    return rows[0] ?? null;
  }

  async create(userId: string, data: {
    seriesName: string;
    units: string;
    purchaseNav: string;
    purchaseDate: string;
    maturityDate: string;
    couponRate: string;
    broker?: string;
  }): Promise<SgbRow> {
    const { rows } = await this.db.query<SgbRow>(
      `INSERT INTO sgb_holding (user_id, series_name, units, purchase_nav, purchase_date, maturity_date, coupon_rate, broker)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [userId, data.seriesName, data.units, data.purchaseNav, data.purchaseDate,
       data.maturityDate, data.couponRate, data.broker ?? null],
    );
    return rows[0]!;
  }

  async update(userId: string, id: string, data: {
    units?: string;
    broker?: string;
  }): Promise<SgbRow | null> {
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (data.units !== undefined) { sets.push(`units = $${idx++}`); params.push(data.units); }
    if (data.broker !== undefined) { sets.push(`broker = $${idx++}`); params.push(data.broker); }

    if (sets.length === 0) return this.findById(userId, id);

    sets.push(`updated_at = NOW()`);
    params.push(id, userId);

    const { rows } = await this.db.query<SgbRow>(
      `UPDATE sgb_holding SET ${sets.join(', ')} WHERE id = $${idx++} AND user_id = $${idx} RETURNING *`,
      params,
    );
    return rows[0] ?? null;
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.db.query(
      `DELETE FROM sgb_holding WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    return (rowCount ?? 0) > 0;
  }
}
