import { loadConfig } from '../config.js';
import { MIGRATIONS } from './migrationFiles.js';
import { createPool, type Db } from './pool.js';

const LOCK = '7310402023';

/**
 * Applies pending migrations in order, all in one transaction. Safe to run
 * concurrently. The lock is transaction-scoped so it is always released, even
 * through a connection pooler (Neon's pooled URL) or a killed function.
 */
export async function migrate(db: Db, log: (s: string) => void = console.log): Promise<void> {
  const c = await db.connect();
  const applied: string[] = [];
  try {
    await c.query('BEGIN');
    await c.query('SELECT pg_advisory_xact_lock($1)', [LOCK]);
    await c.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    for (const { name: f, sql } of MIGRATIONS) {
      if ((await c.query('SELECT 1 FROM schema_migrations WHERE name = $1', [f])).rowCount) continue;
      await c.query(sql);
      await c.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f]);
      applied.push(f);
    }
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
  for (const f of applied) log(`applied ${f}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cfg = loadConfig();
  const db = createPool(cfg.databaseUrl);
  migrate(db).then(() => db.end(), (e) => { console.error(e); process.exit(1); });
}
