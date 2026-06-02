import { Injectable } from '@nestjs/common';
import { DbService } from '@tickernest/common';

export interface UlipRow {
  id: string;
  user_id: string;
  insurer: string;
  plan_name: string;
  policy_number: string | null;
  premium: string;
  frequency: string;
  fund_value: string | null;
  maturity_date: string | null;
  nominee: string | null;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class UlipRepository {
  constructor(private readonly db: DbService) {}

  async findAllByUser(userId: string): Promise<UlipRow[]> {
    const { rows } = await this.db.query<UlipRow>(
      `SELECT * FROM ulip WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId],
    );
    return rows;
  }

  async findById(userId: string, id: string): Promise<UlipRow | null> {
    const { rows } = await this.db.query<UlipRow>(
      `SELECT * FROM ulip WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    return rows[0] ?? null;
  }

  async create(userId: string, data: {
    insurer: string;
    planName: string;
    policyNumber?: string;
    premium: string;
    frequency: string;
    fundValue?: string;
    maturityDate?: string;
    nominee?: string;
  }): Promise<UlipRow> {
    const { rows } = await this.db.query<UlipRow>(
      `INSERT INTO ulip (user_id, insurer, plan_name, policy_number, premium, frequency, fund_value, maturity_date, nominee)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [userId, data.insurer, data.planName, data.policyNumber ?? null,
       data.premium, data.frequency, data.fundValue ?? null,
       data.maturityDate ?? null, data.nominee ?? null],
    );
    return rows[0]!;
  }

  async update(userId: string, id: string, data: {
    fundValue?: string;
    maturityDate?: string;
    nominee?: string;
  }): Promise<UlipRow | null> {
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (data.fundValue !== undefined) { sets.push(`fund_value = $${idx++}`); params.push(data.fundValue); }
    if (data.maturityDate !== undefined) { sets.push(`maturity_date = $${idx++}`); params.push(data.maturityDate); }
    if (data.nominee !== undefined) { sets.push(`nominee = $${idx++}`); params.push(data.nominee); }

    if (sets.length === 0) return this.findById(userId, id);

    sets.push(`updated_at = NOW()`);
    params.push(id, userId);

    const { rows } = await this.db.query<UlipRow>(
      `UPDATE ulip SET ${sets.join(', ')} WHERE id = $${idx++} AND user_id = $${idx} RETURNING *`,
      params,
    );
    return rows[0] ?? null;
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.db.query(
      `DELETE FROM ulip WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    return (rowCount ?? 0) > 0;
  }
}
