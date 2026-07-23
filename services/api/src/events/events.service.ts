import { Injectable } from '@nestjs/common';
import { DbService } from '../common/db.service';

export interface EventRow {
  id: string;
  user_id: string;
  title: string;
  description: string;
  stock_ticker: string | null;
  event_date: string;
  event_time: string | null;
  event_type: string;
  color: string;
  created_at: string;
  updated_at: string;
}

export interface CreateEventDto {
  title: string;
  description?: string;
  stock_ticker?: string;
  event_date: string; // YYYY-MM-DD
  event_time?: string; // HH:mm
  event_type?: string;
  color?: string;
}

export interface UpdateEventDto {
  title?: string;
  description?: string;
  stock_ticker?: string | null;
  event_date?: string;
  event_time?: string | null;
  event_type?: string;
  color?: string;
}

const SELECT_COLS = `id, user_id, title, description, stock_ticker, event_date, event_time, event_type, color, created_at, updated_at`;

@Injectable()
export class EventsService {
  constructor(private readonly db: DbService) {}

  async list(userId: string, from?: string, to?: string): Promise<EventRow[]> {
    return this.db.withUserTx(userId, async (tx) => {
      let sql = `SELECT ${SELECT_COLS} FROM stock_event WHERE user_id = $1`;
      const params: unknown[] = [userId];
      let idx = 2;

      if (from) {
        sql += ` AND event_date >= $${idx++}`;
        params.push(from);
      }
      if (to) {
        sql += ` AND event_date <= $${idx++}`;
        params.push(to);
      }
      sql += ` ORDER BY event_date ASC, event_time ASC NULLS LAST`;

      const { rows } = await tx.query<EventRow>(sql, params);
      return rows;
    });
  }

  async listByMonth(userId: string, month: string): Promise<EventRow[]> {
    // month = "YYYY-MM"
    const from = `${month}-01`;
    const parts = month.split('-').map(Number);
    const y = parts[0]!;
    const m = parts[1]!;
    const lastDay = new Date(y, m, 0).getDate();
    const to = `${month}-${String(lastDay).padStart(2, '0')}`;
    return this.list(userId, from, to);
  }

  async listToday(userId: string): Promise<EventRow[]> {
    return this.db.withUserTx(userId, async (tx) => {
      const today = new Date().toISOString().slice(0, 10);
      const { rows } = await tx.query<EventRow>(
        `SELECT ${SELECT_COLS} FROM stock_event
         WHERE user_id = $1 AND event_date = $2
         ORDER BY event_time ASC NULLS LAST`,
        [userId, today],
      );
      return rows;
    });
  }

  async getOne(userId: string, id: string): Promise<EventRow | null> {
    return this.db.withUserTx(userId, async (tx) => {
      const { rows } = await tx.query<EventRow>(
        `SELECT ${SELECT_COLS} FROM stock_event WHERE id = $1 AND user_id = $2`,
        [id, userId],
      );
      return rows[0] ?? null;
    });
  }

  async create(userId: string, dto: CreateEventDto): Promise<EventRow> {
    return this.db.withUserTx(userId, async (tx) => {
      const { rows } = await tx.query<EventRow>(
        `INSERT INTO stock_event (user_id, title, description, stock_ticker, event_date, event_time, event_type, color)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING ${SELECT_COLS}`,
        [
          userId,
          dto.title,
          dto.description ?? '',
          dto.stock_ticker ?? null,
          dto.event_date,
          dto.event_time ?? null,
          dto.event_type ?? 'custom',
          dto.color ?? '#3b82f6',
        ],
      );
      return rows[0]!;
    });
  }

  async update(userId: string, id: string, dto: UpdateEventDto): Promise<EventRow> {
    return this.db.withUserTx(userId, async (tx) => {
      const sets: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      if (dto.title !== undefined) { sets.push(`title = $${idx++}`); params.push(dto.title); }
      if (dto.description !== undefined) { sets.push(`description = $${idx++}`); params.push(dto.description); }
      if (dto.stock_ticker !== undefined) { sets.push(`stock_ticker = $${idx++}`); params.push(dto.stock_ticker); }
      if (dto.event_date !== undefined) { sets.push(`event_date = $${idx++}`); params.push(dto.event_date); }
      if (dto.event_time !== undefined) { sets.push(`event_time = $${idx++}`); params.push(dto.event_time); }
      if (dto.event_type !== undefined) { sets.push(`event_type = $${idx++}`); params.push(dto.event_type); }
      if (dto.color !== undefined) { sets.push(`color = $${idx++}`); params.push(dto.color); }

      if (sets.length === 0) {
        return (await this.getOne(userId, id))!;
      }

      params.push(id);
      params.push(userId);
      const { rows } = await tx.query<EventRow>(
        `UPDATE stock_event SET ${sets.join(', ')}
         WHERE id = $${idx++} AND user_id = $${idx}
         RETURNING ${SELECT_COLS}`,
        params,
      );
      return rows[0]!;
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.db.withUserTx(userId, async (tx) => {
      await tx.query(`DELETE FROM stock_event WHERE id = $1 AND user_id = $2`, [id, userId]);
    });
  }
}
