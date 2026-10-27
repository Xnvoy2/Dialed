import { createServer } from '../server.js';

/** Long-running host (your Mac, Docker): jobs run on an interval. */
const { app, cfg, tick } = await createServer();

let running = false;
setInterval(async () => {
  if (running) return;
  running = true;
  try {
    const r = await tick();
    if (r && (r.expired || r.matured || r.confirmed || r.failed || r.submitted)) app.log.info({ tick: r }, 'jobs');
  } catch (e) {
    app.log.error(e, 'tick failed');
  } finally {
    running = false;
  }
}, cfg.tickSeconds * 1000).unref();

await app.listen({ port: cfg.port, host: cfg.host });
app.log.info(`Dialed API on :${cfg.port} · ${cfg.env} · payouts ${cfg.network}${cfg.allowDevAuth ? ' · dev sign-in on' : ''}`);
