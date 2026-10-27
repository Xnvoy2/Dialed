import { randomBytes } from 'node:crypto';
import type { Config } from '../config.js';
import { withTx, type Db } from '../db/pool.js';
import { ApiError } from '../domain/rewards.js';
import { APPLE_APP_ATTEST_ROOT } from './appleRoot.js';
import { AttestError, appId, requestClientData, verifyAssertion, verifyAttestation } from './appAttest.js';

const CHALLENGE_TTL_MIN = 5;
const MAX_KEYS_PER_USER = 5;

export interface AttestDeps {
  /** Tests inject their own root; production uses Apple's. */
  rootPem?: string;
}

export async function newChallenge(db: Db, userId: string): Promise<{ challenge: string; expiresAt: string }> {
  const challenge = randomBytes(32).toString('base64url');
  const r = await db.query<{ expires_at: Date }>(
    `INSERT INTO attest_challenges (challenge, user_id, expires_at) VALUES ($1, $2, now() + make_interval(mins => $3)) RETURNING expires_at`,
    [challenge, userId, CHALLENGE_TTL_MIN],
  );
  await db.query(`DELETE FROM attest_challenges WHERE expires_at < now() - interval '1 day'`);
  return { challenge, expiresAt: r.rows[0]!.expires_at.toISOString() };
}

/** Registers an attested key for this user. Idempotent for the same user and key. */
export async function registerKey(db: Db, cfg: Config, userId: string, body: { keyId: string; attestation: string; challenge: string }, deps: AttestDeps = {}) {
  return withTx(db, async (tx) => {
    const c = await tx.query(
      `UPDATE attest_challenges SET used_at = now() WHERE challenge = $1 AND user_id = $2 AND used_at IS NULL AND expires_at > now()`,
      [body.challenge, userId],
    );
    if (!c.rowCount) throw new ApiError(400, 'bad_challenge', 'That check expired. Try again.');
    let key;
    try {
      key = verifyAttestation({
        attestationB64: body.attestation,
        keyIdB64: body.keyId,
        challenge: body.challenge,
        appId: appId(cfg.appleTeamId, cfg.appleBundleId),
        rootPem: deps.rootPem ?? APPLE_APP_ATTEST_ROOT,
        allow: cfg.attestEnv,
      });
    } catch (e) {
      if (e instanceof AttestError) throw new ApiError(401, 'attest_failed', `This device couldn’t be verified (${e.message}).`);
      throw new ApiError(400, 'attest_failed', 'This device couldn’t be verified.');
    }
    const existing = await tx.query<{ user_id: string }>('SELECT user_id FROM device_keys WHERE key_id = $1', [key.keyId]);
    if (existing.rows[0]) {
      if (existing.rows[0].user_id !== userId) throw new ApiError(409, 'key_taken', 'This device is linked to another account.');
      return { keyId: key.keyId, environment: key.environment };
    }
    const n = await tx.query<{ n: bigint }>('SELECT count(*)::int8 AS n FROM device_keys WHERE user_id = $1', [userId]);
    if (Number(n.rows[0]!.n) >= MAX_KEYS_PER_USER) throw new ApiError(429, 'too_many_devices', 'Too many devices on this account. Contact support.');
    await tx.query(
      `INSERT INTO device_keys (key_id, user_id, public_key, environment, receipt) VALUES ($1, $2, $3, $4, $5)`,
      [key.keyId, userId, key.publicKeySpki, key.environment, key.receipt],
    );
    return { keyId: key.keyId, environment: key.environment };
  });
}

/**
 * Checks the App Attest assertion on a sensitive request. Required when
 * cfg.requireAttest; if a client sends one anyway it is always verified.
 */
export async function checkDevice(
  db: Db,
  cfg: Config,
  userId: string,
  req: { method: string; url: string; rawBody: string; keyId?: string; assertion?: string },
) {
  if (!req.keyId || !req.assertion) {
    if (cfg.requireAttest) throw new ApiError(401, 'attest_required', 'Verify this device to continue.');
    return;
  }
  const k = await db.query<{ public_key: Buffer; counter: bigint }>(
    'SELECT public_key, counter FROM device_keys WHERE key_id = $1 AND user_id = $2',
    [req.keyId, userId],
  );
  const row = k.rows[0];
  if (!row) throw new ApiError(401, 'attest_unknown_key', 'Verify this device to continue.');
  let counter: number;
  try {
    counter = verifyAssertion({
      assertionB64: req.assertion,
      clientData: requestClientData(req.method, req.url, req.rawBody),
      publicKeySpki: row.public_key,
      lastCounter: Number(row.counter),
      appId: appId(cfg.appleTeamId, cfg.appleBundleId),
    });
  } catch (e) {
    throw new ApiError(401, 'attest_bad_assertion', 'This request couldn’t be verified as coming from the Dialed app.');
  }
  // Compare-and-set so two requests with the same counter can't both pass.
  const u = await db.query('UPDATE device_keys SET counter = $3, last_used_at = now() WHERE key_id = $1 AND counter < $3 AND user_id = $2', [
    req.keyId,
    userId,
    counter,
  ]);
  if (!u.rowCount) throw new ApiError(401, 'attest_bad_assertion', 'This request couldn’t be verified as coming from the Dialed app.');
}
