import http from 'node:http';
import { attachDatabasePool, waitUntil } from '@vercel/functions';
import Fastify from 'fastify';
import { createServer, startupSteps } from './server.js';

/**
 * Vercel entrypoint (Fastify on Fluid compute). Background jobs: Vercel Cron
 * hits /v1/cron/tick, and each session award or payout request settles itself
 * via waitUntil.
 *
 * Vercel expects the server to listen as soon as the module loads, but setup
 * (database, migrations, Solana) takes a few seconds. So a thin outer server
 * listens right away and hands each request to the real app once it's ready.
 */
const ready = createServer({
  onPool: (pool) => attachDatabasePool(pool),
  background: (p) => waitUntil(p),
}).then(async ({ app }) => {
  await app.ready();
  console.log('startup: ready');
  return app;
});
ready.catch((e) => console.error('startup failed:', e));

const outer = Fastify({
  serverFactory: (handler) =>
    http.createServer((req, res) => {
      if (req.url === '/v1/startup') {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ steps: startupSteps }));
        return;
      }
      ready.then(
        (app) => app.routing(req, res),
        () => {
          res.statusCode = 503;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: 'startup_failed', message: 'The server could not start. Check the logs.' }));
        },
      );
      void handler;
    }),
});

// Not awaited: on Vercel, listen is taken over by the platform and its promise
// never resolves, so awaiting it keeps the function from ever finishing loading.
outer.listen({ port: Number(process.env.PORT ?? 3000), host: '0.0.0.0' }).catch((e) => {
  console.error('listen failed:', e);
  process.exit(1);
});
