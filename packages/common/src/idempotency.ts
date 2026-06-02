/**
 * Generic idempotency: a write is identified by (userId, idempotencyKey) and
 * yields a recordId (the natural primary key of whatever was written).
 *
 * Both lookup and record run inside the SAME transaction as the underlying
 * mutation — otherwise "record exists ⇔ work committed" can't be guaranteed.
 *
 * The Postgres impl in `idempotency.pg.ts` requires a Tx; the in-memory test
 * impl ignores it.
 */
import { Tx } from './db/db.service';

export type IdempotencyResolution =
  | { status: 'NEW' }
  | { status: 'REPLAY'; recordId: string };

export interface IdempotencyStore {
  lookup(
    userId: string,
    key: string,
    tx?: Tx,
  ): Promise<{ recordId: string } | null>;
  record(
    userId: string,
    key: string,
    recordId: string,
    endpoint: string,
    tx: Tx,
  ): Promise<void>;
}

export class IdempotencyService {
  constructor(private readonly store: IdempotencyStore) {}

  async resolve(
    userId: string,
    key: string,
    tx?: Tx,
  ): Promise<IdempotencyResolution> {
    const prior = await this.store.lookup(userId, key, tx);
    if (prior) return { status: 'REPLAY', recordId: prior.recordId };
    return { status: 'NEW' };
  }
}
