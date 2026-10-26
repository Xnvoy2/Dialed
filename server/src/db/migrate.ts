import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfig, SERVER_ROOT } from '../config.js';
import { createPool, type Db } from './pool.js';

const LOCK = '7310402023';

/** Applies pending migrations in order, each in its own transaction. Safe to run concurrently. */
export async function migrate(db: Db, log: (s: string) => void = console.log): Promise<void> {
  const dir = resolve(SERVER_ROOT, 'migrations');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const c = await db.connect();
  try {
    await c.query('SELECT pg_advisory_lock($1)', [LOCK]);
    await c.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    for (const f of files) {
      if ((await c.query('SELECT 1 FROM schema_migrations WHERE name = $1', [f])).rowCount) continue;
      try {
        await c.query('BEGIN');
        await c.query(readFileSync(resolve(dir, f), 'utf8'));
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
