import { attachDatabasePool, waitUntil } from '@vercel/functions';
// Vercel picks the entrypoint that imports fastify; the app itself is built in server.ts.
import 'fastify';
import { createServer } from './server.js';

/**
 * Vercel entrypoint (Fastify on Fluid compute). Vercel routes requests to the
 * server started here. Background jobs: Vercel Cron hits /v1/cron/tick, and
 * each session award or payout request settles itself via waitUntil.
 */
const { app } = await createServer({
  onPool: (pool) => attachDatabasePool(pool),
  background: (p) => waitUntil(p),
});

await app.listen({ port: Number(process.env.PORT ?? 3000), host: '0.0.0.0' });
