/**
 * Forward-only migrator. Runs every *.sql file under db/migrations in
 * lexical order, recording success in a `_tn_migrations` table. Idempotent:
 * already-applied files are skipped.
 *
 * Run as the Fly release_command so every deploy applies new migrations
 * before the new image starts handling traffic.
 *
 * Local usage:
 *   npx ts-node src/scripts/migrate.ts          (reads api/.env automatically)
 *   DATABASE_URL=<url> npx ts-node src/scripts/migrate.ts
 */
import { Client } from 'pg';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

// Load .env from the project root (api/) when DATABASE_URL is not already set.
// This avoids a dotenv dependency — we just parse KEY=VALUE lines ourselves.
function loadDotEnv() {
  const envPath = join(process.cwd(), '.env');
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (key && !(key in process.env)) {
      process.env[key] = val;
    }
  }
}
loadDotEnv();

async function main() {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is required');
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _tn_migrations (
        name      TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        sha256    TEXT NOT NULL
      )
    `);

    const dir = join(process.cwd(), 'db', 'migrations');
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    for (const f of files) {
      const sql = readFileSync(join(dir, f), 'utf-8');
      const sha = createHash('sha256').update(sql).digest('hex');
      const applied = await client.query<{ sha256: string }>(
        `SELECT sha256 FROM _tn_migrations WHERE name = $1`,
        [f],
      );
      if (applied.rowCount && applied.rowCount > 0) {
        if (applied.rows[0]!.sha256 !== sha) {
          throw new Error(`migration ${f} already applied with a different hash`);
        }
        // eslint-disable-next-line no-console
        console.log(`[migrate] skip ${f}`);
        continue;
      }
      // eslint-disable-next-line no-console
      console.log(`[migrate] apply ${f}`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          `INSERT INTO _tn_migrations (name, sha256) VALUES ($1, $2)`,
          [f, sha],
        );
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }
    }
    // eslint-disable-next-line no-console
    console.log('[migrate] done');
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
