import { loadConfig } from '../config.js';
import { MIGRATIONS } from './migrationFiles.js';
import { createPool, type Db } from './pool.js';

const LOCK = '7310402023';

/** Applies pending migrations in order, each in its own transaction. Safe to run concurrently. */
export async function migrate(db: Db, log: (s: string) => void = console.log): Promise<void> {
  const c = await db.connect();
  try {
    await c.query('SELECT pg_advisory_lock($1)', [LOCK]);
    await c.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    for (const { name: f, sql } of MIGRATIONS) {
      if ((await c.query('SELECT 1 FROM schema_migrations WHERE name = $1', [f])).rowCount) continue;
      try {
        await c.query('BEGIN');
        await c.query(sql);
        await c.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f]);
        await c.query('COMMIT');
        log(`applied ${f}`);
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      }
    }
  } finally {
    await c.query('SELECT pg_advisory_unlock($1)', [LOCK]).catch(() => {});
    c.release();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cfg = loadConfig();
  const db = createPool(cfg.databaseUrl);
  migrate(db).then(() => db.end(), (e) => { console.error(e); process.exit(1); });
}
