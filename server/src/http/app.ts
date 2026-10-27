import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import type { JWTVerifyGetKey } from 'jose';
import { z, ZodError } from 'zod';
import { checkDevice, newChallenge, registerKey } from '../attest/devices.js';
import { authenticate, issueSession, upsertUser, verifyAppleToken } from '../auth/auth.js';
import type { Config } from '../config.js';
import { withTx, type Db } from '../db/pool.js';
import { A, transfer, treasuryTotals, userBalances } from '../domain/ledger.js';
import { requestPayout, validAddress } from '../domain/payouts.js';
import {
  ApiError,
  acceptOffer,
  activity,
  balancesDto,
  listOffers,
  programStatus,
  releaseReservation,
  submitSession,
} from '../domain/rewards.js';

export interface AppDeps {
  db: Db;
  cfg: Config;
  /** Tests inject a local key set; production uses Apple's published keys. */
  appleKeys?: JWTVerifyGetKey;
  /** Tests inject their own App Attest root certificate. */
  attestRootPem?: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: string;
  }
}

const TERMS_VERSION = '2026-10-26';
const amountString = z.string().regex(/^\d{1,15}$/).transform((s) => BigInt(s));

export async function buildApp({ db, cfg, appleKeys, attestRootPem }: AppDeps): Promise<FastifyInstance> {
  const hosted = cfg.env === 'staging' || cfg.env === 'production';
  const app = Fastify({
    logger: cfg.env === 'development' ? { level: 'info' } : hosted ? { level: 'warn' } : false,
    bodyLimit: 32 * 1024,
    // Behind the host's HTTPS proxy: rate limits need the caller's real IP.
    trustProxy: hosted,
  });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  app.addHook('onRequest', async (req, reply) => {
    reply.header('cache-control', 'no-store');
  });

  // Keep the exact JSON text: App Attest assertions sign a hash of it.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    const text = String(body);
    req.rawBody = text;
    if (text === '') return done(null, undefined);
    try {
      done(null, JSON.parse(text));
    } catch {
      const err = new Error('Body is not valid JSON.') as Error & { statusCode: number };
      err.statusCode = 400;
      done(err, undefined);
    }
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ApiError) return reply.status(err.status).send({ error: err.code, message: err.message });
    if (err instanceof ZodError) return reply.status(400).send({ error: 'bad_request', message: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
    if ((err as { statusCode?: number }).statusCode === 429) return reply.status(429).send({ error: 'rate_limited', message: 'Too many requests.' });
    if ((err as { statusCode?: number }).statusCode === 400) return reply.status(400).send({ error: 'bad_request', message: (err as Error).message });
    app.log.error(err);
    return reply.status(500).send({ error: 'internal', message: 'Something went wrong.' });
  });

  const user = (req: FastifyRequest) => authenticate(cfg, db, req.headers.authorization);
  const idem = (req: FastifyRequest) => String(req.headers['idempotency-key'] ?? '');
  /** Signed-in user on a request that moves or claims money: also needs a verified device. */
  const deviceUser = async (req: FastifyRequest) => {
    const id = await user(req);
    await checkDevice(db, cfg, id, {
      method: req.method,
      url: req.url,
      rawBody: req.rawBody ?? '',
      keyId: req.headers['x-dialed-key-id'] as string | undefined,
      assertion: req.headers['x-dialed-assertion'] as string | undefined,
    });
    return id;
  };

  app.get('/v1/health', async () => ({ ok: true, network: cfg.network, env: cfg.env, attest: cfg.requireAttest }));

  // -------------------------------------------------------------- App Attest
  app.post('/v1/attest/challenge', async (req) => newChallenge(db, await user(req)));
  app.post('/v1/attest/keys', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const id = await user(req);
    const body = z
      .object({ keyId: z.string().min(40).max(64), attestation: z.string().min(100).max(20000), challenge: z.string().min(20).max(100) })
      .parse(req.body);
    return registerKey(db, cfg, id, body, { rootPem: attestRootPem });
  });

  // -------------------------------------------------------------- auth
  app.post('/v1/auth/apple', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
    const body = z.object({ identityToken: z.string().min(20).max(5000), displayName: z.string().max(80).nullish() }).parse(req.body);
    const sub = await verifyAppleToken(cfg, body.identityToken, appleKeys);
    const u = await upsertUser(db, sub, body.displayName ?? null);
    return { token: await issueSession(cfg, u.id, u.token_version), user: { id: u.id, displayName: u.display_name, payoutAddress: u.payout_address } };
  });

  if (cfg.allowDevAuth) {
    // Development only: the iOS Simulator has no Apple Account. Disabled in staging by config.
    app.post('/v1/auth/dev', async (req) => {
      const body = z.object({ deviceId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/) }).parse(req.body);
      const u = await upsertUser(db, `dev:${body.deviceId}`, 'Simulator');
      return { token: await issueSession(cfg, u.id, u.token_version), user: { id: u.id, displayName: u.display_name, payoutAddress: u.payout_address } };
    });
  }

  app.get('/v1/me', async (req) => {
    const id = await user(req);
    const r = await db.query<{ display_name: string | null; payout_address: string | null }>(
      'SELECT display_name, payout_address FROM users WHERE id = $1', [id]);
    return { id, displayName: r.rows[0]?.display_name ?? null, payoutAddress: r.rows[0]?.payout_address ?? null };
  });

  app.put('/v1/me/payout-address', async (req) => {
    const id = await deviceUser(req);
    const { address } = z.object({ address: z.string().nullable() }).parse(req.body);
    if (address !== null && !validAddress(address)) throw new ApiError(400, 'bad_address', 'That is not a valid Solana address.');
    await db.query('UPDATE users SET payout_address = $2 WHERE id = $1', [id, address]);
    return { payoutAddress: address };
  });

  app.post('/v1/me/sign-out-everywhere', async (req) => {
    const id = await user(req);
    await db.query('UPDATE users SET token_version = token_version + 1 WHERE id = $1', [id]);
    return { ok: true };
  });

  /**
   * Deletes the account: the Apple identity, name and payout address are
   * removed and every session is revoked. Pending/available rewards are
   * forfeited back to the treasury (only with confirmForfeit). Payment records
   * stay, unlinked from any identity, because the ledger is append-only.
   */
  app.delete('/v1/me', async (req) => {
    const id = await user(req);
    const { confirmForfeit } = z.object({ confirmForfeit: z.boolean().default(false) }).parse(req.body ?? {});
    return withTx(db, async (tx) => {
      await tx.query('SELECT 1 FROM treasury WHERE id = 1 FOR UPDATE');
      const b = await userBalances(tx, id);
      if (b.inflight > 0n) throw new ApiError(409, 'payout_in_flight', 'Wait for your payout to finish before deleting your account.');
      if (b.pending + b.available > 0n && !confirmForfeit) {
        throw new ApiError(409, 'has_balance', 'You still have rewards. Pay them out, or confirm you want to give them up.');
      }
      if (b.pending > 0n) await transfer(tx, A.pending(id), A.unallocated, b.pending, `forfeit:${id}`);
      if (b.available > 0n) await transfer(tx, A.available(id), A.unallocated, b.available, `forfeit:${id}`);
      await tx.query(`UPDATE awards SET state = 'forfeited' WHERE user_id = $1 AND state IN ('pending','available')`, [id]);
      const held = await tx.query<{ id: string; amount: bigint; offer_id: string }>(
        `UPDATE reservations SET status = 'released', release_reason = 'account_deleted', closed_at = now()
         WHERE user_id = $1 AND status = 'held' RETURNING id, amount, offer_id`, [id]);
      for (const r of held.rows) {
        await tx.query('UPDATE offers SET budget_remaining = budget_remaining + $2 WHERE id = $1', [r.offer_id, r.amount.toString()]);
        await transfer(tx, A.reserved, A.unallocated, r.amount, `released:${r.id}`);
      }
      await tx.query(
        `UPDATE users SET apple_sub = 'deleted:' || id::text, display_name = NULL, payout_address = NULL, token_version = token_version + 1 WHERE id = $1`,
        [id]);
      return { deleted: true };
    });
  });

  // -------------------------------------------------------------- rewards
  app.get('/v1/program', async () => ({
    status: await programStatus(db),
    network: cfg.network,
    termsVersion: TERMS_VERSION,
    attestRequired: cfg.requireAttest,
    minPayout: cfg.minPayoutBaseUnits.toString(),
    maxPayout: cfg.maxPayoutBaseUnits.toString(),
    payoutsPaused: (await db.query<{ payouts_paused: boolean }>('SELECT payouts_paused FROM treasury WHERE id = 1')).rows[0]?.payouts_paused ?? false,
  }));

  app.get('/v1/offers', async (req) => listOffers(db, await user(req)));

  app.post('/v1/offers/:id/accept', async (req) => {
    const id = await deviceUser(req);
    const { id: offerId } = z.object({ id: z.string().uuid() }).parse(req.params);
    return acceptOffer(db, id, offerId, idem(req));
  });

  app.post('/v1/reservations/:id/release', async (req) => {
    const id = await user(req);
    const { id: resId } = z.object({ id: z.string().uuid() }).parse(req.params);
    return releaseReservation(db, id, resId);
  });

  app.post('/v1/sessions', async (req) => submitSession(db, cfg, await deviceUser(req), req.body));

  app.get('/v1/balances', async (req) => ({ ...(await balancesDto(db, await user(req))), network: cfg.network }));

  app.get('/v1/activity', async (req) => activity(db, await user(req)));

  app.post('/v1/payouts', async (req) => {
    const id = await deviceUser(req);
    const { amount } = z.object({ amount: amountString }).parse(req.body);
    return requestPayout(db, cfg, id, amount, idem(req));
  });

  /** "Where your rewards came from": funding by source and what's been paid. */
  app.get('/v1/transparency', async () => {
    const t = await treasuryTotals(db);
    const sources = await db.query<{ source: string; total: bigint; n: bigint }>(
      `SELECT source, SUM(amount)::int8 AS total, COUNT(*)::int8 AS n FROM deposits GROUP BY source ORDER BY total DESC`);
    return {
      network: cfg.network,
      deposited: t.deposited.toString(),
      unallocated: t.unallocated.toString(),
      reserved: t.reserved.toString(),
      owed: t.owed.toString(),
      paid: t.paid.toString(),
      sources: sources.rows.map((s) => ({ source: s.source, total: s.total.toString(), deposits: Number(s.n) })),
    };
  });

  return app;
}
