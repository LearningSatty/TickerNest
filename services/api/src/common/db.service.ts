/**
 * Postgres pool wrapper. Two responsibilities:
 *  1. Lend a pooled client and ensure release.
 *  2. Run work inside a TX that has `request.jwt.claim.sub` set so RLS
 *     policies (USING user_id = auth.uid()) match the current user.
 *
 * NEVER bypass `withUserTx` for user-scoped writes — it's the only thing
 * making RLS effective.
 */
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

export type Tx = PoolClient;

@Injectable()
export class DbService implements OnModuleDestroy {
  private readonly log = new Logger(DbService.name);
  private readonly pool: Pool;

  constructor(cfg: ConfigService) {
    this.pool = new Pool({
      connectionString: cfg.get<string>('DATABASE_URL'),
      max: Number(cfg.get<string>('DB_POOL_MAX') ?? 10),
      idleTimeoutMillis: 30_000,
      keepAlive: true,
    });
    this.pool.on('error', (e: Error) => this.log.error('pool error', e.stack));
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  /** Read query (no RLS context needed for ticker_meta etc.). */
  async query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(sql, params as unknown[]);
  }

  /**
   * Run `fn` inside a TX with the user JWT subject claim set, so every
   * statement in the TX sees `auth.uid() = userId` and RLS lets the user
   * touch only their rows.
   */
  async withUserTx<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // SET LOCAL is per-TX and reverts on COMMIT/ROLLBACK.
      // The setting name matches the one read by auth.uid() in 0001_init.sql.
      await client.query(
        `SELECT set_config('request.jwt.claim.sub', $1, true)`,
        [userId],
      );
      const out = await fn(client);
      await client.query('COMMIT');
      return out;
    } catch (e) {
      try {
        await client.query('ROLLBACK');
      } catch (rbErr) {
        this.log.warn(`rollback failed: ${(rbErr as Error).message}`);
      }
      throw e;
    } finally {
      client.release();
    }
  }
}
