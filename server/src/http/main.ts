import { loadConfig } from '../config.js';
import { migrate } from '../db/migrate.js';
import { createPool } from '../db/pool.js';
import { payoutDeps, tick } from '../runtime.js';
import { buildApp } from './app.js';

const cfg = loadConfig();
const db = createPool(cfg.databaseUrl);
await migrate(db);
const deps = await payoutDeps(cfg);
const app = await buildApp({ db, cfg });

// Background jobs: expiry, review window, payouts.
let running = false;
setInterval(async () => {
  if (running) return;
  running = true;
  try {
    const r = await tick(db, cfg, deps);
    if (r.expired || r.matured || r.confirmed || r.failed || r.submitted) app.log.info({ tick: r }, 'jobs');
  } catch (e) {
    app.log.error(e, 'tick failed');
  } finally {
    running = false;
  }
}, cfg.tickSeconds * 1000).unref();

await app.listen({ port: cfg.port, host: cfg.host });
app.log.info(`Dialed API on :${cfg.port} · ${cfg.env} · payouts ${cfg.network}${cfg.allowDevAuth ? ' · dev sign-in on' : ''}`);
