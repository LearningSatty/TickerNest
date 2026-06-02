import { Injectable } from '@nestjs/common';
import { IdempotencyStore } from './idempotency';
import { Tx } from './db.service';

/**
 * Postgres-backed IdempotencyStore. Both methods take an explicit Tx so the
 * idempotency record is written in the SAME TX as the underlying mutation.
 * That's the only way to keep "record exists ⇔ mutation committed" honest.
 */
@Injectable()
export class PgIdempotencyStore implements IdempotencyStore {
  async lookup(
    userId: string,
    key: string,
    tx?: Tx,
  ): Promise<{ recordId: string } | null> {
    if (!tx) throw new Error('PgIdempotencyStore requires a Tx');
    const r = await tx.query(
      `SELECT record_id FROM idempotency_record
        WHERE user_id = $1 AND idempotency_key = $2`,
      [userId, key],
    );
    if (r.rowCount === 0) return null;
    return { recordId: r.rows[0]!.record_id as string };
  }

  async record(
    userId: string,
    key: string,
    recordId: string,
    endpoint: string,
    tx: Tx,
  ): Promise<void> {
    await tx.query(
      `INSERT INTO idempotency_record (user_id, idempotency_key, endpoint, record_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, idempotency_key) DO NOTHING`,
      [userId, key, endpoint, recordId],
    );
  }
}
