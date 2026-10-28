import { loadConfig } from './config.js';
import { migrate } from './db/migrate.js';
import { createPool } from './db/pool.js';
import { buildApp } from './http/app.js';
import { payoutDeps, settleSoon, tickOnce } from './runtime.js';

/** What startup has finished so far, for diagnosing a slow or stuck start. */
export const startupSteps: string[] = [];

/**
 * Builds the configured server: database, migrations, payout signer, routes.
 * `background` decides how money-moving work runs after a response:
 * an interval on a long-running host, or Vercel's waitUntil on serverless.
 */
export async function createServer(opts: { onPool?: (pool: ReturnType<typeof createPool>) => void; background?: (p: Promise<unknown>) => void } = {}) {
  const t0 = Date.now();
  const step = (s: string) => { startupSteps.push(`${s} (${Date.now() - t0} ms)`); console.log(`startup: ${s} (${Date.now() - t0} ms)`); };
  step('begin');
  const cfg = loadConfig();
  step('config ok');
  const db = createPool(cfg.databaseUrl, process.env.VERCEL ? 5 : 10);
  opts.onPool?.(db);
  await migrate(db, (s) => step(s));
  step('database ready');
  const deps = await payoutDeps(cfg);
  step(`payouts ready (${cfg.network})`);
  const tick = () => tickOnce(db, cfg, deps);
  const app = await buildApp({
    db,
    cfg,
    tick,
    onMoneyEvent: opts.background
      ? () => opts.background!(settleSoon(db, cfg, deps).catch((e) => app.log.error(e, 'settle failed')))
      : undefined,
  });
  return { app, db, cfg, deps, tick };
}
