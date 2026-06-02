import { Injectable } from '@nestjs/common';
import { DbService } from '@tickernest/common';

export interface GoldRow {
  id: string;
  user_id: string;
  type: string;
  weight_grams: string;
  purity: number;
  purchase_price_per_gram: string;
  purchase_date: string | null;
  storage_location: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class GoldRepository {
  constructor(private readonly db: DbService) {}

  async findAllByUser(userId: string): Promise<GoldRow[]> {
    const { rows } = await this.db.query<GoldRow>(
      `SELECT * FROM gold_holding WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId],
    );
    return rows;
  }

  async findById(userId: string, id: string): Promise<GoldRow | null> {
    const { rows } = await this.db.query<GoldRow>(
      `SELECT * FROM gold_holding WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    return rows[0] ?? null;
  }

  async create(userId: string, data: {
    type: string;
    weightGrams: string;
    purity: number;
    purchasePricePerGram: string;
    purchaseDate?: string;
    storageLocation?: string;
    notes?: string;
  }): Promise<GoldRow> {
    const { rows } = await this.db.query<GoldRow>(
      `INSERT INTO gold_holding (user_id, type, weight_grams, purity, purchase_price_per_gram, purchase_date, storage_location, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [userId, data.type, data.weightGrams, data.purity, data.purchasePricePerGram,
       data.purchaseDate ?? null, data.storageLocation ?? null, data.notes ?? null],
    );
    return rows[0]!;
  }

  async update(userId: string, id: string, data: {
    weightGrams?: string;
    purchasePricePerGram?: string;
    notes?: string;
  }): Promise<GoldRow | null> {
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (data.weightGrams !== undefined) { sets.push(`weight_grams = $${idx++}`); params.push(data.weightGrams); }
    if (data.purchasePricePerGram !== undefined) { sets.push(`purchase_price_per_gram = $${idx++}`); params.push(data.purchasePricePerGram); }
    if (data.notes !== undefined) { sets.push(`notes = $${idx++}`); params.push(data.notes); }

    if (sets.length === 0) return this.findById(userId, id);

    sets.push(`updated_at = NOW()`);
    params.push(id, userId);

    const { rows } = await this.db.query<GoldRow>(
      `UPDATE gold_holding SET ${sets.join(', ')} WHERE id = $${idx++} AND user_id = $${idx} RETURNING *`,
      params,
    );
    return rows[0] ?? null;
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.db.query(
      `DELETE FROM gold_holding WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    return (rowCount ?? 0) > 0;
  }
}
