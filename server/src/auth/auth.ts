import { SignJWT, createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { Config } from '../config.js';
import type { Queryable } from '../db/pool.js';
import { ApiError } from '../domain/rewards.js';

const APPLE_ISSUER = 'https://appleid.apple.com';
let appleKeys: JWTVerifyGetKey | null = null;
const defaultAppleKeys = () => (appleKeys ??= createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys')));

/**
 * Verifies a Sign in with Apple identity token: Apple's signature, issuer,
 * audience (our bundle id) and expiry. Returns Apple's stable user id.
 */
export async function verifyAppleToken(cfg: Config, token: string, keys: JWTVerifyGetKey = defaultAppleKeys()): Promise<string> {
  try {
    const { payload } = await jwtVerify(token, keys, { issuer: APPLE_ISSUER, audience: cfg.appleBundleId });
    if (!payload.sub) throw new Error('no sub');
    return payload.sub;
  } catch {
    throw new ApiError(401, 'bad_apple_token', 'Sign in with Apple could not be verified.');
  }
}

export async function upsertUser(q: Queryable, appleSub: string, displayName: string | null) {
  const r = await q.query<{ id: string; token_version: number; display_name: string | null; payout_address: string | null }>(
    `INSERT INTO users (apple_sub, display_name) VALUES ($1, $2)
     ON CONFLICT (apple_sub) DO UPDATE SET display_name = COALESCE(users.display_name, EXCLUDED.display_name)
     RETURNING id, token_version, display_name, payout_address`,
    [appleSub, displayName],
  );
  return r.rows[0]!;
}

export async function issueSession(cfg: Config, userId: string, version: number): Promise<string> {
  return new SignJWT({ ver: version })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setAudience('dialed-app')
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(cfg.sessionSecret);
}

/** Returns the user id for a valid, unrevoked session token. */
export async function authenticate(cfg: Config, q: Queryable, header: string | undefined): Promise<string> {
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new ApiError(401, 'unauthenticated', 'Sign in required.');
  try {
    const { payload } = await jwtVerify(token, cfg.sessionSecret, { audience: 'dialed-app', algorithms: ['HS256'] });
    const r = await q.query<{ token_version: number }>('SELECT token_version FROM users WHERE id = $1', [payload.sub]);
    if (!r.rows[0] || r.rows[0].token_version !== payload.ver) throw new Error('revoked');
    return payload.sub!;
  } catch {
    throw new ApiError(401, 'unauthenticated', 'Your session has expired. Sign in again.');
  }
}
