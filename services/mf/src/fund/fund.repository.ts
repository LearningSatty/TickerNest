import { Injectable } from '@nestjs/common';
import { DbService } from '@tickernest/common';

export interface FundRow {
  id: string;
  user_id: string;
  scheme_code: string;
  fund_name: string;
  amc: string | null;
  category: string | null;
  goal: string | null;
  units: string;
  avg_nav: string;
  current_nav: string | null;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class FundRepository {
  constructor(private readonly db: DbService) {}

  async findAllByUser(userId: string): Promise<FundRow[]> {
    const { rows } = await this.db.query<FundRow>(
      `SELECT * FROM mutual_fund WHERE user_id = $1 ORDER BY fund_name`,
      [userId],
    );
    return rows;
  }

  async findById(userId: string, id: string): Promise<FundRow | null> {
    const { rows } = await this.db.query<FundRow>(
      `SELECT * FROM mutual_fund WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    return rows[0] ?? null;
  }

  async upsert(userId: string, data: {
    schemeCode: string;
    fundName: string;
    amc?: string;
    category?: string;
    goal?: string;
    units: string;
    avgNav: string;
  }): Promise<FundRow> {
    const { rows } = await this.db.query<FundRow>(
      `INSERT INTO mutual_fund (user_id, scheme_code, fund_name, amc, category, goal, units, avg_nav)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id, scheme_code)
       DO UPDATE SET fund_name = EXCLUDED.fund_name, amc = EXCLUDED.amc,
                     category = EXCLUDED.category, goal = EXCLUDED.goal,
                     units = EXCLUDED.units, avg_nav = EXCLUDED.avg_nav,
                     updated_at = NOW()
       RETURNING *`,
      [userId, data.schemeCode, data.fundName, data.amc ?? null,
       data.category ?? null, data.goal ?? null, data.units, data.avgNav],
    );
    return rows[0]!;
  }

  async update(userId: string, id: string, data: {
    units?: string;
    avgNav?: string;
    currentNav?: string;
    goal?: string;
  }): Promise<FundRow | null> {
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (data.units !== undefined) { sets.push(`units = $${idx++}`); params.push(data.units); }
    if (data.avgNav !== undefined) { sets.push(`avg_nav = $${idx++}`); params.push(data.avgNav); }
    if (data.currentNav !== undefined) { sets.push(`current_nav = $${idx++}`); params.push(data.currentNav); }
    if (data.goal !== undefined) { sets.push(`goal = $${idx++}`); params.push(data.goal); }

    if (sets.length === 0) return this.findById(userId, id);

    sets.push(`updated_at = NOW()`);
    params.push(id, userId);

    const { rows } = await this.db.query<FundRow>(
      `UPDATE mutual_fund SET ${sets.join(', ')} WHERE id = $${idx++} AND user_id = $${idx} RETURNING *`,
      params,
    );
    return rows[0] ?? null;
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.db.query(
      `DELETE FROM mutual_fund WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    return (rowCount ?? 0) > 0;
  }
}
