/**
 * Postgres pool wrapper. Two responsibilities:
 *  1. Lend a pooled client and ensure release.
 *  2. Run work inside a TX that has `request.jwt.claim.sub` set so RLS
 *     policies (USING user_id = auth.uid()) match the current user.
 *
 * NEVER bypass `withUserTx` for user-scoped writes — it's the only thing
 * making RLS effective.
 *
 * Connection resilience (Supabase free-tier):
 *   Supabase runs on AWS; the NAT gateway silently drops TCP connections that
 *   have been idle for ~350 s.  Three layers of defence:
 *   1. idleTimeoutMillis: 30 s  — pool evicts idle sockets well before the NAT
 *      kills them, so we never hold a dead connection.
 *   2. keepAlive + keepAliveInitialDelayMillis: 10 s — the OS sends TCP
 *      keep-alive probes on *active* connections, preventing mid-query drops.
 *   3. Per-client error handler in withUserTx — pg only attaches the pool's
 *      'error' handler to idle clients; a socket error on a checked-out client
 *      would otherwise be "Unhandled 'error' event" and crash the process.
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
      // Evict idle connections after 25 s — well under Supabase/AWS NAT's
      // ~350 s idle-kill window, so we never hold a dead socket in the pool.
      idleTimeoutMillis: 25_000,
      // Timeout waiting for a connection from the pool (avoids hanging forever
      // when all slots are occupied).
      connectionTimeoutMillis: 5_000,
      // TCP keep-alive: sends OS-level probes on active sockets so the NAT
      // gateway doesn't silently kill long-running queries.
      keepAlive: true,
      keepAliveInitialDelayMillis: 10_000,
    });

    // Handles errors on *idle* clients in the pool (e.g. a socket that was
    // returned to the pool and later dropped by the remote).
    this.pool.on('error', (e: Error, client: PoolClient) => {
      this.log.warn(`idle client error — evicting from pool: ${e.message}`);
      // Release with an error flag so pg removes it from the pool rather than
      // recycling the dead socket.
      try { client.release(e); } catch { /* already released */ }
    });
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

    // Attach a temporary error handler for the duration of this checkout.
    // pg's pool-level handler is only active for idle clients; without this,
    // an ETIMEDOUT on a checked-out socket becomes an unhandled 'error' event
    // and crashes the process.
    let clientError: Error | null = null;
    const onClientError = (e: Error) => {
      clientError = e;
      this.log.warn(`client socket error during transaction: ${e.message}`);
    };
    client.on('error', onClientError);

    try {
      await client.query('BEGIN');
      // SET LOCAL is per-TX and reverts on COMMIT/ROLLBACK.
      // The setting name matches the one read by auth.uid() in 0001_init.sql.
      await client.query(
        `SELECT set_config('request.jwt.claim.sub', $1, true)`,
        [userId],
      );
      const out = await fn(client);
      if (clientError) throw clientError; // surface socket drop before COMMIT
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
      client.off('error', onClientError);
      // Pass the error (if any) so pg discards the dead socket instead of
      // returning it to the pool.
      client.release(clientError ?? undefined);
    }
  }
}
