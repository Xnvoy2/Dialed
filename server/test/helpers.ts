import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWTVerifyGetKey } from 'jose';
import { loadConfig, type Config } from '../src/config.js';
import { migrate } from '../src/db/migrate.js';
import { createPool, type Db } from '../src/db/pool.js';
import { buildApp } from '../src/http/app.js';
import { openOffer, publishRule, recordDeposit } from '../src/domain/rewards.js';

export function testConfig(over: Record<string, string> = {}): Config {
  return loadConfig({ DIALED_ENV: 'test', DIALED_PAYOUT_NETWORK: 'simulated', DIALED_REVIEW_HOURS: '0', ...over });
}

export async function freshDb(): Promise<Db> {
  const db = createPool(testConfig().databaseUrl);
  await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;'); // TRUNCATE is blocked; dropping the schema is the reset
  await migrate(db, () => {});
  return db;
}

/** A stand-in for Apple's key set, so tests can mint real signed identity tokens. */
export async function fakeApple() {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'test', alg: 'RS256' };
  const keys: JWTVerifyGetKey = createLocalJWKSet({ keys: [jwk] });
  const token = (sub: string, opts: { aud?: string; iss?: string; exp?: string } = {}) =>
    new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: 'test' })
      .setIssuer(opts.iss ?? 'https://appleid.apple.com')
      .setAudience(opts.aud ?? 'com.joshbarton.dialed')
      .setSubject(sub)
      .setIssuedAt()
      .setExpirationTime(opts.exp ?? '10m')
      .sign(privateKey);
  return { keys, token };
}

export async function setup(over: Record<string, string> = {}, extra: { attestRootPem?: string } = {}) {
  const db = await freshDb();
  const cfg = testConfig(over);
  const apple = await fakeApple();
  const app = await buildApp({ db, cfg, appleKeys: apple.keys, attestRootPem: extra.attestRootPem });
  const signIn = async (sub: string) => {
    const r = await app.inject({ method: 'POST', url: '/v1/auth/apple', payload: { identityToken: await apple.token(sub) } });
    if (r.statusCode !== 200) throw new Error(r.body);
    const body = r.json() as { token: string; user: { id: string } };
    return { token: body.token, id: body.user.id, h: { authorization: `Bearer ${body.token}` } };
  };
  return { db, cfg, app, apple, signIn };
}

/** Funds the treasury and opens one 0.10 USDC, 25-minute offer. */
export async function seedOffer(db: Db, cfg: Config, opts: { deposit?: bigint; budget?: bigint; daily?: number; weekly?: number; blocking?: boolean } = {}) {
  await recordDeposit(db, cfg, { amount: opts.deposit ?? 10_000_000n, reference: `seed-${Math.random()}`, source: 'Founders' });
  await publishRule(db, {
    version: 'focus-25-v1',
    title: 'Complete a 25-minute lock-in',
    minActiveSeconds: 1500,
    requiresBlocking: opts.blocking ?? false,
    amount: 100_000n,
    dailyCap: opts.daily ?? 2,
    weeklyCap: opts.weekly ?? 8,
    terms: 'Complete one 25-minute lock-in after accepting. Fixed 0.10 USDC.',
  });
  return openOffer(db, { ruleVersion: 'focus-25-v1', budget: opts.budget ?? 1_000_000n });
}

export function evidence(reservationId: string, acceptedAt: Date, over: Partial<Record<string, unknown>> = {}) {
  const start = new Date(acceptedAt.getTime() + 60_000);
  const end = new Date(start.getTime() + 26 * 60_000);
  return {
    clientSessionId: `s-${Math.random().toString(36).slice(2)}`,
    reservationId,
    startedAt: start.toISOString(),
    endedAt: end.toISOString(),
    plannedSeconds: 1500,
    activeSeconds: 1500,
    pauseCount: 0,
    blockingApplied: true,
    appVersion: '0.1.0',
    ...over,
  };
}

export const key = () => `k${Math.random().toString(36).slice(2)}${Date.now()}`;
