import { z } from 'zod';
import type { Config } from '../config.js';
import { withTx, type Db, type Queryable, type Tx } from '../db/pool.js';
import { A, balance, transfer, userBalances } from './ledger.js';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

// ------------------------------------------------------------------ operator

export async function recordDeposit(
  db: Db,
  cfg: Config,
  input: { amount: bigint; reference: string; source: string },
): Promise<{ id: string; duplicate: boolean }> {
  if (input.amount <= 0n) throw new ApiError(400, 'bad_amount', 'Deposit must be positive.');
  return withTx(db, async (tx) => {
    await lockTreasury(tx);
    const existing = await tx.query<{ id: string }>('SELECT id FROM deposits WHERE reference = $1', [input.reference]);
    if (existing.rows[0]) return { id: existing.rows[0].id, duplicate: true };
    const r = await tx.query<{ id: string }>(
      'INSERT INTO deposits (amount, network, reference, source) VALUES ($1, $2, $3, $4) RETURNING id',
      [input.amount.toString(), cfg.network, input.reference, input.source],
    );
    await transfer(tx, A.deposits, A.unallocated, input.amount, `deposit:${r.rows[0]!.id}`);
    return { id: r.rows[0]!.id, duplicate: false };
  });
}

export const RuleInput = z.object({
  version: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,40}$/),
  title: z.string().min(3).max(80),
  minActiveSeconds: z.number().int().min(60),
  requiresBlocking: z.boolean().default(false),
  amount: z.bigint().positive(),
  dailyCap: z.number().int().positive(),
  weeklyCap: z.number().int().positive(),
  terms: z.string().min(10).max(2000),
});

export async function publishRule(db: Queryable, input: z.infer<typeof RuleInput>): Promise<void> {
  const r = RuleInput.parse(input);
  await db.query(
    `INSERT INTO reward_rules (version, title, min_active_seconds, requires_blocking, amount, daily_cap, weekly_cap, terms)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [r.version, r.title, r.minActiveSeconds, r.requiresBlocking, r.amount.toString(), r.dailyCap, r.weeklyCap, r.terms],
  );
}

export async function openOffer(
  db: Queryable,
  input: { ruleVersion: string; budget: bigint; ttlSeconds?: number },
): Promise<string> {
  const rule = await db.query('SELECT 1 FROM reward_rules WHERE version = $1 AND retired_at IS NULL', [input.ruleVersion]);
  if (!rule.rowCount) throw new ApiError(400, 'unknown_rule', `No active rule ${input.ruleVersion}.`);
  if (input.budget <= 0n) throw new ApiError(400, 'bad_budget', 'Budget must be positive.');
  const r = await db.query<{ id: string }>(
    `INSERT INTO offers (rule_version, status, budget_total, budget_remaining, reservation_ttl_seconds)
     VALUES ($1, 'open', $2, $2, $3) RETURNING id`,
    [input.ruleVersion, input.budget.toString(), input.ttlSeconds ?? 86400],
  );
  return r.rows[0]!.id;
}

export async function setOfferStatus(db: Queryable, id: string, status: 'open' | 'paused' | 'closed'): Promise<void> {
  const r = await db.query('UPDATE offers SET status = $2 WHERE id = $1', [id, status]);
  if (!r.rowCount) throw new ApiError(404, 'not_found', 'No such offer.');
}

async function lockTreasury(tx: Tx): Promise<{ paused: boolean }> {
  const r = await tx.query<{ paused: boolean }>('SELECT paused FROM treasury WHERE id = 1 FOR UPDATE');
  return r.rows[0]!;
}

// ------------------------------------------------------------------ program and offers

export type ProgramStatus = 'not_live' | 'live' | 'paused_no_funds';

export async function programStatus(q: Queryable): Promise<ProgramStatus> {
  const offers = await q.query<{ amount: bigint }>(
    `SELECT r.amount FROM offers o JOIN reward_rules r ON r.version = o.rule_version
     WHERE o.status = 'open' AND r.retired_at IS NULL AND o.budget_remaining >= r.amount`,
  );
  if (!offers.rowCount) return 'not_live';
  const t = await q.query<{ paused: boolean }>('SELECT paused FROM treasury WHERE id = 1');
  if (t.rows[0]?.paused) return 'paused_no_funds';
  const unallocated = await balance(q, A.unallocated);
  const cheapest = offers.rows.reduce((m, r) => (r.amount < m ? r.amount : m), offers.rows[0]!.amount);
  return unallocated >= cheapest ? 'live' : 'paused_no_funds';
}

/** Caps count reservations held or consumed in the current UTC day and ISO week. */
async function capUsage(q: Queryable, userId: string, ruleVersion: string, now: Date) {
  const r = await q.query<{ day: bigint; week: bigint }>(
    `SELECT
       COUNT(*) FILTER (WHERE res.created_at >= date_trunc('day', $3::timestamptz AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')::int8 AS day,
       COUNT(*) FILTER (WHERE res.created_at >= date_trunc('week', $3::timestamptz AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')::int8 AS week
     FROM reservations res JOIN offers o ON o.id = res.offer_id
     WHERE res.user_id = $1 AND o.rule_version = $2 AND res.status IN ('held','consumed')`,
    [userId, ruleVersion, now.toISOString()],
  );
  return { day: Number(r.rows[0]?.day ?? 0n), week: Number(r.rows[0]?.week ?? 0n) };
}

export async function listOffers(q: Queryable, userId: string, now = new Date()) {
  const r = await q.query<{
    id: string;
    version: string;
    title: string;
    amount: bigint;
    min_active_seconds: number;
    requires_blocking: boolean;
    daily_cap: number;
    weekly_cap: number;
    terms: string;
    budget_remaining: bigint;
    reservation_ttl_seconds: number;
  }>(
    `SELECT o.id, r.version, r.title, r.amount, r.min_active_seconds, r.requires_blocking, r.daily_cap, r.weekly_cap,
            r.terms, o.budget_remaining, o.reservation_ttl_seconds
     FROM offers o JOIN reward_rules r ON r.version = o.rule_version
     WHERE o.status = 'open' AND r.retired_at IS NULL AND o.budget_remaining >= r.amount
     ORDER BY o.created_at`,
  );
  const held = await q.query<{ id: string; offer_id: string; expires_at: Date }>(
    `SELECT id, offer_id, expires_at FROM reservations WHERE user_id = $1 AND status = 'held' AND expires_at > $2`,
    [userId, now.toISOString()],
  );
  const out = [];
  for (const o of r.rows) {
    const used = await capUsage(q, userId, o.version, now);
    const h = held.rows.find((x) => x.offer_id === o.id);
    out.push({
      id: o.id,
      ruleVersion: o.version,
      title: o.title,
      amount: o.amount.toString(),
      minActiveSeconds: o.min_active_seconds,
      requiresBlocking: o.requires_blocking,
      dailyCap: o.daily_cap,
      weeklyCap: o.weekly_cap,
      usedToday: used.day,
      usedThisWeek: used.week,
      terms: o.terms,
      reservationTtlSeconds: o.reservation_ttl_seconds,
      heldReservation: h ? { id: h.id, expiresAt: h.expires_at.toISOString() } : null,
    });
  }
  return out;
}

// ------------------------------------------------------------------ accept

export async function acceptOffer(db: Db, userId: string, offerId: string, idempotencyKey: string, now = new Date()) {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(idempotencyKey)) throw new ApiError(400, 'bad_idempotency_key', 'Idempotency-Key is required.');
  return withTx(db, async (tx) => {
    const prior = await tx.query<{ id: string; amount: bigint; expires_at: Date; status: string }>(
      'SELECT id, amount, expires_at, status FROM reservations WHERE user_id = $1 AND idempotency_key = $2',
      [userId, idempotencyKey],
    );
    if (prior.rows[0]) return reservationDto(prior.rows[0], offerId);

    const t = await lockTreasury(tx);
    if (t.paused) throw new ApiError(409, 'paused_no_funds', 'New offers are paused.');
    const o = await tx.query<{
      status: string;
      budget_remaining: bigint;
      rule_version: string;
      amount: bigint;
      daily_cap: number;
      weekly_cap: number;
      ttl: number;
      retired_at: Date | null;
    }>(
      `SELECT o.status, o.budget_remaining, o.rule_version, r.amount, r.daily_cap, r.weekly_cap, r.retired_at,
              o.reservation_ttl_seconds AS ttl
       FROM offers o JOIN reward_rules r ON r.version = o.rule_version WHERE o.id = $1 FOR UPDATE OF o`,
      [offerId],
    );
    const offer = o.rows[0];
    if (!offer || offer.status !== 'open' || offer.retired_at) throw new ApiError(404, 'offer_closed', 'This offer is not open.');
    if (offer.budget_remaining < offer.amount) throw new ApiError(409, 'offer_exhausted', 'This offer has run out.');

    const existing = await tx.query(
      `SELECT 1 FROM reservations WHERE user_id = $1 AND offer_id = $2 AND status = 'held' AND expires_at > $3`,
      [userId, offerId, now.toISOString()],
    );
    if (existing.rowCount) throw new ApiError(409, 'already_held', 'You already have this offer open.');

    const used = await capUsage(tx, userId, offer.rule_version, now);
    if (used.day >= offer.daily_cap) throw new ApiError(409, 'daily_cap', 'Daily limit reached for this offer.');
    if (used.week >= offer.weekly_cap) throw new ApiError(409, 'weekly_cap', 'Weekly limit reached for this offer.');

    const unallocated = await balance(tx, A.unallocated);
    if (unallocated < offer.amount) {
      // Out of money: pause new offers. Existing obligations are untouched.
      await tx.query('UPDATE treasury SET paused = true WHERE id = 1');
      throw new ApiError(409, 'paused_no_funds', 'Rewards are paused until more funding arrives.');
    }

    const expires = new Date(now.getTime() + offer.ttl * 1000);
    const res = await tx.query<{ id: string; amount: bigint; expires_at: Date; status: string }>(
      `INSERT INTO reservations (offer_id, user_id, amount, status, idempotency_key, created_at, expires_at)
       VALUES ($1, $2, $3, 'held', $4, $5, $6) RETURNING id, amount, expires_at, status`,
      [offerId, userId, offer.amount.toString(), idempotencyKey, now.toISOString(), expires.toISOString()],
    );
    await tx.query('UPDATE offers SET budget_remaining = budget_remaining - $2 WHERE id = $1', [offerId, offer.amount.toString()]);
    await transfer(tx, A.unallocated, A.reserved, offer.amount, `reserve:${res.rows[0]!.id}`);
    return reservationDto(res.rows[0]!, offerId);
  });
}

function reservationDto(r: { id: string; amount: bigint; expires_at: Date; status: string }, offerId: string) {
  return { id: r.id, offerId, amount: r.amount.toString(), expiresAt: r.expires_at.toISOString(), status: r.status };
}

/** Returns a held reservation's money to the treasury and its budget to the offer. */
async function closeReservation(tx: Tx, id: string, status: 'released' | 'expired', reason: string, now: Date) {
  const r = await tx.query<{ amount: bigint; offer_id: string }>(
    `UPDATE reservations SET status = $2, release_reason = $3, closed_at = $4
     WHERE id = $1 AND status = 'held' RETURNING amount, offer_id`,
    [id, status, reason, now.toISOString()],
  );
  const row = r.rows[0];
  if (!row) return false;
  await tx.query('UPDATE offers SET budget_remaining = budget_remaining + $2 WHERE id = $1', [row.offer_id, row.amount.toString()]);
  await transfer(tx, A.reserved, A.unallocated, row.amount, `${status}:${id}`);
  return true;
}

export async function releaseReservation(db: Db, userId: string, id: string, now = new Date()) {
  return withTx(db, async (tx) => {
    await lockTreasury(tx);
    const own = await tx.query('SELECT 1 FROM reservations WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!own.rowCount) throw new ApiError(404, 'not_found', 'No such reservation.');
    return { released: await closeReservation(tx, id, 'released', 'user', now) };
  });
}

// ------------------------------------------------------------------ session evidence

export const Evidence = z.object({
  clientSessionId: z.string().min(4).max(80),
  reservationId: z.string().uuid(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  plannedSeconds: z.number().int().positive().max(6 * 3600),
  activeSeconds: z.number().int().nonnegative().max(6 * 3600),
  pauseCount: z.number().int().nonnegative().max(500),
  blockingApplied: z.boolean(),
  appVersion: z.string().max(40),
});
export type Evidence = z.infer<typeof Evidence>;

export type Decision =
  | { outcome: 'awarded'; entryId: string; amount: string; state: 'pending' | 'available'; availableAt: string }
  | { outcome: 'not_eligible'; reason: string }
  | { outcome: 'duplicate'; entryId: string };

/**
 * Checks a finished session against the reservation's rule using signals the
 * server can bound with its own clock. None of this proves work happened; it
 * proves the claim is consistent with a stated rule (see docs/SESSION_SIGNALS.md).
 */
export async function submitSession(db: Db, cfg: Config, userId: string, raw: unknown, now = new Date()): Promise<Decision> {
  const ev = Evidence.parse(raw);
  return withTx(db, async (tx) => {
    const dup = await tx.query<{ id: string }>(
      'SELECT id FROM awards WHERE user_id = $1 AND client_session_id = $2',
      [userId, ev.clientSessionId],
    );
    if (dup.rows[0]) return { outcome: 'duplicate', entryId: dup.rows[0].id };

    await lockTreasury(tx);
    const r = await tx.query<{
      status: string;
      amount: bigint;
      created_at: Date;
      expires_at: Date;
      rule_version: string;
      min_active_seconds: number;
      requires_blocking: boolean;
    }>(
      `SELECT res.status, res.amount, res.created_at, res.expires_at, o.rule_version, ru.min_active_seconds, ru.requires_blocking
       FROM reservations res JOIN offers o ON o.id = res.offer_id JOIN reward_rules ru ON ru.version = o.rule_version
       WHERE res.id = $1 AND res.user_id = $2 FOR UPDATE OF res`,
      [ev.reservationId, userId],
    );
    const res = r.rows[0];
    if (!res) throw new ApiError(404, 'not_found', 'No such reservation.');
    if (res.status !== 'held') return { outcome: 'not_eligible', reason: `This offer is already ${res.status}.` };
    if (res.expires_at <= now) {
      await closeReservation(tx, ev.reservationId, 'expired', 'submitted_after_expiry', now);
      return { outcome: 'not_eligible', reason: 'The offer expired before the session was submitted.' };
    }

    const started = new Date(ev.startedAt).getTime();
    const ended = new Date(ev.endedAt).getTime();
    const reasons: string[] = [];
    if (ev.activeSeconds < res.min_active_seconds) reasons.push(`needs ${Math.round(res.min_active_seconds / 60)} active minutes`);
    if (ended < started) reasons.push('session ends before it starts');
    if ((ended - started) / 1000 + 5 < ev.activeSeconds) reasons.push('active time is longer than the session');
    if (started < res.created_at.getTime() - 60_000) reasons.push('session started before the offer was accepted');
    if (ended > now.getTime() + 60_000) reasons.push('session ends in the future');
    // Server clock: no more focus can be claimed than time that passed since accepting.
    if ((now.getTime() - res.created_at.getTime()) / 1000 + 60 < ev.activeSeconds) {
      reasons.push('more active time than has passed since the offer was accepted');
    }
    if (res.requires_blocking && !ev.blockingApplied) reasons.push('this offer requires app blocking to be on');

    if (reasons.length) {
      await closeReservation(tx, ev.reservationId, 'released', `rejected: ${reasons.join('; ')}`, now);
      return { outcome: 'not_eligible', reason: `Not eligible: ${reasons.join('; ')}.` };
    }

    const availableAt = new Date(now.getTime() + cfg.reviewHours * 3600_000);
    const state = cfg.reviewHours <= 0 ? 'available' : 'pending';
    await tx.query(`UPDATE reservations SET status = 'consumed', closed_at = $2 WHERE id = $1`, [ev.reservationId, now.toISOString()]);
    const a = await tx.query<{ id: string }>(
      `INSERT INTO awards (user_id, reservation_id, client_session_id, rule_version, amount, state, evidence, created_at, available_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [userId, ev.reservationId, ev.clientSessionId, res.rule_version, res.amount.toString(), state,
        JSON.stringify(ev), now.toISOString(), availableAt.toISOString()],
    );
    const id = a.rows[0]!.id;
    await transfer(tx, A.reserved, A.pending(userId), res.amount, `award:${id}`);
    if (state === 'available') await transfer(tx, A.pending(userId), A.available(userId), res.amount, `mature:${id}`);
    return { outcome: 'awarded', entryId: id, amount: res.amount.toString(), state, availableAt: availableAt.toISOString() };
  });
}

// ------------------------------------------------------------------ jobs

/** Expires stale reservations and moves awards past their review window to available. */
export async function runHousekeeping(db: Db, now = new Date()) {
  let expired = 0;
  let matured = 0;
  const stale = await db.query<{ id: string }>(
    `SELECT id FROM reservations WHERE status = 'held' AND expires_at <= $1 ORDER BY expires_at LIMIT 500`,
    [now.toISOString()],
  );
  for (const { id } of stale.rows) {
    await withTx(db, async (tx) => {
      await lockTreasury(tx);
      if (await closeReservation(tx, id, 'expired', 'ttl', now)) expired++;
    });
  }
  const due = await db.query<{ id: string }>(
    `SELECT id FROM awards WHERE state = 'pending' AND available_at <= $1 ORDER BY available_at LIMIT 500`,
    [now.toISOString()],
  );
  for (const { id } of due.rows) {
    await withTx(db, async (tx) => {
      const r = await tx.query<{ user_id: string; amount: bigint }>(
        `UPDATE awards SET state = 'available' WHERE id = $1 AND state = 'pending' RETURNING user_id, amount`,
        [id],
      );
      const row = r.rows[0];
      if (!row) return;
      await transfer(tx, A.pending(row.user_id), A.available(row.user_id), row.amount, `mature:${id}`);
      matured++;
    });
  }
  // Funding arrived since a pause: resume when the cheapest open offer is affordable again.
  await withTx(db, async (tx) => {
    const t = await lockTreasury(tx);
    if (!t.paused) return;
    const cheapest = await tx.query<{ m: bigint | null }>(
      `SELECT MIN(r.amount)::int8 AS m FROM offers o JOIN reward_rules r ON r.version = o.rule_version WHERE o.status = 'open'`,
    );
    const m = cheapest.rows[0]?.m;
    if (m != null && (await balance(tx, A.unallocated)) >= m) await tx.query('UPDATE treasury SET paused = false WHERE id = 1');
  });
  return { expired, matured };
}

export async function balancesDto(q: Queryable, userId: string) {
  const b = await userBalances(q, userId);
  return { pending: b.pending.toString(), available: b.available.toString(), inflight: b.inflight.toString(), paid: b.paid.toString() };
}

export async function activity(q: Queryable, userId: string) {
  const awards = await q.query<{ id: string; amount: bigint; state: string; created_at: Date; available_at: Date; title: string }>(
    `SELECT a.id, a.amount, a.state, a.created_at, a.available_at, r.title
     FROM awards a JOIN reward_rules r ON r.version = a.rule_version WHERE a.user_id = $1 ORDER BY a.created_at DESC LIMIT 100`,
    [userId],
  );
  const payouts = await q.query<{
    id: string;
    amount: bigint;
    status: string;
    network: string;
    signature: string | null;
    destination: string;
    created_at: Date;
  }>(
    `SELECT id, amount, status, network, signature, destination, created_at FROM payouts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [userId],
  );
  return {
    awards: awards.rows.map((a) => ({
      id: a.id,
      title: a.title,
      amount: a.amount.toString(),
      state: a.state,
      createdAt: a.created_at.toISOString(),
      availableAt: a.available_at.toISOString(),
    })),
    payouts: payouts.rows.map((p) => ({
      id: p.id,
      amount: p.amount.toString(),
      status: p.status,
      network: p.network,
      signature: p.signature,
      destination: p.destination,
      createdAt: p.created_at.toISOString(),
    })),
  };
}
