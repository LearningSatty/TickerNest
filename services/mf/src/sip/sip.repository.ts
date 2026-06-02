import { Injectable } from '@nestjs/common';
import { DbService } from '@tickernest/common';

export interface SipRow {
  id: string;
  user_id: string;
  fund_id: string | null;
  fund_name: string;
  scheme_code: string | null;
  amount: string;
  frequency: string;
  sip_date: number | null;
  start_date: string;
  end_date: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class SipRepository {
  constructor(private readonly db: DbService) {}

  async findAllByUser(userId: string): Promise<SipRow[]> {
    const { rows } = await this.db.query<SipRow>(
      `SELECT * FROM sip WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId],
    );
    return rows;
  }

  async findById(userId: string, id: string): Promise<SipRow | null> {
    const { rows } = await this.db.query<SipRow>(
      `SELECT * FROM sip WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    return rows[0] ?? null;
  }

  async create(userId: string, data: {
    fundName: string;
    schemeCode?: string;
    amount: string;
    frequency: string;
    sipDate?: number;
    startDate: string;
    endDate?: string;
  }): Promise<SipRow> {
    const { rows } = await this.db.query<SipRow>(
      `INSERT INTO sip (user_id, fund_name, scheme_code, amount, frequency, sip_date, start_date, end_date, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE')
       RETURNING *`,
      [userId, data.fundName, data.schemeCode ?? null, data.amount,
       data.frequency, data.sipDate ?? null, data.startDate, data.endDate ?? null],
    );
    return rows[0]!;
  }

  async update(userId: string, id: string, data: {
    amount?: string;
    status?: string;
    endDate?: string;
  }): Promise<SipRow | null> {
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (data.amount !== undefined) { sets.push(`amount = $${idx++}`); params.push(data.amount); }
    if (data.status !== undefined) { sets.push(`status = $${idx++}`); params.push(data.status); }
    if (data.endDate !== undefined) { sets.push(`end_date = $${idx++}`); params.push(data.endDate); }

    if (sets.length === 0) return this.findById(userId, id);

    sets.push(`updated_at = NOW()`);
    params.push(id, userId);

    const { rows } = await this.db.query<SipRow>(
      `UPDATE sip SET ${sets.join(', ')} WHERE id = $${idx++} AND user_id = $${idx} RETURNING *`,
      params,
    );
    return rows[0] ?? null;
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.db.query(
      `DELETE FROM sip WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    return (rowCount ?? 0) > 0;
  }
}
