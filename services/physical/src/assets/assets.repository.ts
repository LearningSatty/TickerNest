import { Injectable } from '@nestjs/common';
import { DbService } from '@tickernest/common';

export interface AssetRow {
  id: string;
  user_id: string;
  type: string;
  name: string;
  institution: string | null;
  invested: string;
  current_value: string;
  interest_rate: string | null;
  maturity_date: string | null;
  nominee: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventRow {
  id: string;
  user_id: string;
  asset_id: string;
  type: string;
  amount: string;
  event_date: string;
  notes: string | null;
  created_at: string;
}

@Injectable()
export class AssetsRepository {
  constructor(private readonly db: DbService) {}

  // --- Asset CRUD ---

  async findAllByUser(userId: string): Promise<AssetRow[]> {
    const { rows } = await this.db.query<AssetRow>(
      `SELECT * FROM manual_asset WHERE user_id = $1 ORDER BY name`,
      [userId],
    );
    return rows;
  }

  async findById(userId: string, id: string): Promise<AssetRow | null> {
    const { rows } = await this.db.query<AssetRow>(
      `SELECT * FROM manual_asset WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    return rows[0] ?? null;
  }

  async create(userId: string, data: {
    type: string;
    name: string;
    institution?: string;
    invested: string;
    currentValue: string;
    interestRate?: string;
    maturityDate?: string;
    nominee?: string;
    notes?: string;
  }): Promise<AssetRow> {
    const { rows } = await this.db.query<AssetRow>(
      `INSERT INTO manual_asset (user_id, type, name, institution, invested, current_value, interest_rate, maturity_date, nominee, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [userId, data.type, data.name, data.institution ?? null,
       data.invested, data.currentValue, data.interestRate ?? null,
       data.maturityDate ?? null, data.nominee ?? null, data.notes ?? null],
    );
    return rows[0]!;
  }

  async update(userId: string, id: string, data: {
    currentValue?: string;
    interestRate?: string;
    maturityDate?: string;
    notes?: string;
  }): Promise<AssetRow | null> {
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (data.currentValue !== undefined) { sets.push(`current_value = $${idx++}`); params.push(data.currentValue); }
    if (data.interestRate !== undefined) { sets.push(`interest_rate = $${idx++}`); params.push(data.interestRate); }
    if (data.maturityDate !== undefined) { sets.push(`maturity_date = $${idx++}`); params.push(data.maturityDate); }
    if (data.notes !== undefined) { sets.push(`notes = $${idx++}`); params.push(data.notes); }

    if (sets.length === 0) return this.findById(userId, id);

    sets.push(`updated_at = NOW()`);
    params.push(id, userId);

    const { rows } = await this.db.query<AssetRow>(
      `UPDATE manual_asset SET ${sets.join(', ')} WHERE id = $${idx++} AND user_id = $${idx} RETURNING *`,
      params,
    );
    return rows[0] ?? null;
  }

  async updateValues(userId: string, id: string, invested: string, currentValue: string): Promise<void> {
    await this.db.query(
      `UPDATE manual_asset SET invested = $1, current_value = $2, updated_at = NOW() WHERE id = $3 AND user_id = $4`,
      [invested, currentValue, id, userId],
    );
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.db.query(
      `DELETE FROM manual_asset WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    return (rowCount ?? 0) > 0;
  }

  // --- Event operations ---

  async createEvent(userId: string, assetId: string, data: {
    type: string;
    amount: string;
    eventDate: string;
    notes?: string;
  }): Promise<EventRow> {
    const { rows } = await this.db.query<EventRow>(
      `INSERT INTO manual_asset_event (user_id, asset_id, type, amount, event_date, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [userId, assetId, data.type, data.amount, data.eventDate, data.notes ?? null],
    );
    return rows[0]!;
  }

  async findEventsByAsset(userId: string, assetId: string): Promise<EventRow[]> {
    const { rows } = await this.db.query<EventRow>(
      `SELECT * FROM manual_asset_event WHERE asset_id = $1 AND user_id = $2 ORDER BY event_date DESC`,
      [assetId, userId],
    );
    return rows;
  }
}
