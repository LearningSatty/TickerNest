/**
 * UserSyncService — ensures every authenticated user has a row in `app_user`.
 *
 * Why: Supabase Auth creates rows in `auth.users` automatically, but our
 * application tables (broker, holding, watchlist, …) FK to our own `app_user`
 * table. Without a matching row, every INSERT fails with FK violation.
 *
 * The service runs an idempotent UPSERT on the FIRST request per (process,
 * userId) and caches the userId in memory afterwards.  No DB hit on the
 * 99.9% hot path.
 *
 * The INSERT runs OUTSIDE withUserTx because RLS would block the very first
 * insert for self (auth.uid() can't see a row that doesn't exist yet).  We
 * use a privileged path: a plain pool query with `set_config` cleared, so
 * RLS sees no claim and the policy `id = auth.uid()` allows the row through.
 *
 * Wait — that doesn't work because the policy has WITH CHECK (id = auth.uid()).
 * Solution: run the UPSERT in a TX where we set the claim FIRST, so the
 * INSERT's WITH CHECK passes (id == auth.uid() == claims.sub).
 */
import { Injectable, Logger } from '@nestjs/common';
import { DbService } from '../common/db.service';

@Injectable()
export class UserSyncService {
  private readonly log = new Logger(UserSyncService.name);
  private readonly seen = new Set<string>();
  private inflight = new Map<string, Promise<void>>();

  constructor(private readonly db: DbService) {}

  /** Idempotent — safe to call on every request. */
  async ensure(userId: string): Promise<void> {
    if (this.seen.has(userId)) return;
    // De-dupe in-flight inserts for the same userId across concurrent requests.
    const existing = this.inflight.get(userId);
    if (existing) return existing;

    const p = this.doEnsure(userId);
    this.inflight.set(userId, p);
    try {
      await p;
      this.seen.add(userId);
    } finally {
      this.inflight.delete(userId);
    }
  }

  private async doEnsure(userId: string): Promise<void> {
    await this.db.withUserTx(userId, async (tx) => {
      // INSERT with explicit id; ON CONFLICT DO NOTHING in case of races.
      await tx.query(
        `INSERT INTO app_user (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
        [userId],
      );
    });
    this.log.log(`Ensured app_user row for ${userId}`);
  }
}
