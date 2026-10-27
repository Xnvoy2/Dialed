import { isAddress } from '@solana/kit';
import type { Config } from '../config.js';
import { withTx, type Db } from '../db/pool.js';
import { RpcUncertain, type ChainClient } from '../solana/chain.js';
import type { TreasurySigner } from '../solana/signer.js';
import { formatUsdc as fmt } from '../config.js';
import { A, balance, transfer } from './ledger.js';
import { ApiError } from './rewards.js';

export function validAddress(a: string): boolean {
  return typeof a === 'string' && a.length >= 32 && a.length <= 44 && isAddress(a);
}

/** Moves the amount from available to inflight and records the request. Idempotent per key. */
export async function requestPayout(db: Db, cfg: Config, userId: string, amount: bigint, idempotencyKey: string) {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(idempotencyKey)) throw new ApiError(400, 'bad_idempotency_key', 'Idempotency-Key is required.');
  if (amount <= 0n) throw new ApiError(400, 'bad_amount', 'Amount must be positive.');
  if (amount > cfg.maxPayoutBaseUnits) throw new ApiError(400, 'over_limit', `One payout can carry at most ${fmt(cfg.maxPayoutBaseUnits)} USDC.`);
  if (amount < cfg.minPayoutBaseUnits) throw new ApiError(400, 'under_minimum', `The smallest payout is ${fmt(cfg.minPayoutBaseUnits)} USDC.`);
  return withTx(db, async (tx) => {
    // Serialise payout requests so the daily cap can't be raced past.
    const t = await tx.query<{ payouts_paused: boolean }>('SELECT payouts_paused FROM treasury WHERE id = 1 FOR UPDATE');
    const prior = await tx.query<{ id: string; status: string; amount: bigint }>(
      'SELECT id, status, amount FROM payouts WHERE user_id = $1 AND idempotency_key = $2',
      [userId, idempotencyKey],
    );
    if (prior.rows[0]) return { id: prior.rows[0].id, status: prior.rows[0].status, amount: prior.rows[0].amount.toString() };
    if (t.rows[0]?.payouts_paused) throw new ApiError(503, 'payouts_paused', 'Payouts are paused for now. Your balance is safe.');
    const day = await tx.query<{ total: bigint }>(
      `SELECT COALESCE(SUM(amount), 0)::int8 AS total FROM payouts
       WHERE status <> 'failed' AND created_at > now() - interval '24 hours'`);
    if (BigInt(day.rows[0]!.total) + amount > cfg.dailyPayoutCapBaseUnits) {
      throw new ApiError(429, 'daily_cap', 'Today’s payouts are at their limit. Try again tomorrow; your balance is safe.');
    }
    const u = await tx.query<{ payout_address: string | null }>('SELECT payout_address FROM users WHERE id = $1 FOR UPDATE', [userId]);
    const dest = u.rows[0]?.payout_address;
    if (!dest) throw new ApiError(409, 'no_address', 'Add a Solana address to receive payouts.');
    const avail = await balance(tx, A.available(userId));
    if (avail < amount) throw new ApiError(409, 'insufficient', 'Not enough available to pay out.');
    const r = await tx.query<{ id: string }>(
      `INSERT INTO payouts (user_id, amount, destination, network, status, idempotency_key)
       VALUES ($1, $2, $3, $4, 'requested', $5) RETURNING id`,
      [userId, amount.toString(), dest, cfg.network, idempotencyKey],
    );
    await transfer(tx, A.available(userId), A.inflight(userId), amount, `payout:${r.rows[0]!.id}`);
    return { id: r.rows[0]!.id, status: 'requested', amount: amount.toString() };
  });
}

async function settle(db: Db, id: string, ok: boolean, patch: { signature?: string; error?: string }) {
  await withTx(db, async (tx) => {
    const r = await tx.query<{ user_id: string; amount: bigint }>(
      `UPDATE payouts SET status = $2, signature = COALESCE($3, signature), last_error = $4, updated_at = now()
       WHERE id = $1 AND status IN ('requested','submitted') RETURNING user_id, amount`,
      [id, ok ? 'confirmed' : 'failed', patch.signature ?? null, patch.error ?? null],
    );
    const row = r.rows[0];
    if (!row) return;
    if (ok) await transfer(tx, A.inflight(row.user_id), A.paid(row.user_id), row.amount, `paid:${id}`);
    else await transfer(tx, A.inflight(row.user_id), A.available(row.user_id), row.amount, `refund:${id}`);
  });
}

export interface PayoutDeps {
  chain?: ChainClient;
  signer?: TreasurySigner;
}

/**
 * Advances open payouts one step.
 * Simulated: confirm immediately with a labelled fake signature.
 * Devnet: record the signature and blockhash expiry BEFORE sending, then
 * confirm. An uncertain send is never retried blindly: a new transaction is
 * built only when the old one is not found AND its blockhash has expired, so it
 * can no longer land.
 */
export async function processPayouts(db: Db, cfg: Config, deps: PayoutDeps = {}) {
  const open = await db.query<{
    id: string;
    amount: bigint;
    destination: string;
    status: string;
    network: string;
    signature: string | null;
    last_valid_block_height: bigint | null;
    attempts: number;
  }>(`SELECT id, amount, destination, status, network, signature, last_valid_block_height, attempts
      FROM payouts WHERE status IN ('requested','submitted') ORDER BY created_at LIMIT 50`);
  const summary = { confirmed: 0, failed: 0, submitted: 0, waiting: 0 };
  const paused = (await db.query<{ payouts_paused: boolean }>('SELECT payouts_paused FROM treasury WHERE id = 1')).rows[0]?.payouts_paused;

  for (const p of open.rows) {
    // Paused: don't send anything new. Already-submitted transactions are still
    // checked below so their outcome is recorded.
    if (paused && p.status === 'requested') {
      summary.waiting++;
      continue;
    }
    if (p.network === 'simulated') {
      await settle(db, p.id, true, { signature: `SIMULATED-${p.id}` });
      summary.confirmed++;
      continue;
    }
    const { chain, signer } = deps;
    if (!chain || !signer || p.network !== cfg.network) {
      summary.waiting++;
      continue;
    }
    try {
      if (p.status === 'submitted' && p.signature && p.last_valid_block_height != null) {
        const st = await chain.getSignatureStatus(p.signature);
        if (st && (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized')) {
          if (st.err) {
            await settle(db, p.id, false, { error: `on-chain error: ${JSON.stringify(st.err)}` });
            summary.failed++;
          } else {
            await settle(db, p.id, true, {});
            summary.confirmed++;
          }
          continue;
        }
        const height = await chain.getBlockHeight();
        if (!st && height > p.last_valid_block_height) {
          // Never landed and can no longer land: safe to build a fresh transaction.
          await db.query(`UPDATE payouts SET status = 'requested', signature = NULL, last_valid_block_height = NULL, updated_at = now() WHERE id = $1 AND status = 'submitted'`, [p.id]);
        }
        summary.waiting++;
        continue;
      }

      if (p.attempts >= 5) {
        await settle(db, p.id, false, { error: 'gave up after 5 attempts' });
        summary.failed++;
        continue;
      }
      const held = await chain.getTokenAccountBalance(signer.sourceTokenAccount);
      if (held == null || held < p.amount) {
        await db.query(`UPDATE payouts SET last_error = 'treasury token balance too low', updated_at = now() WHERE id = $1`, [p.id]);
        await db.query('UPDATE treasury SET paused = true WHERE id = 1');
        summary.waiting++;
        continue;
      }
      const life = await chain.getLatestBlockhash();
      const signed = await signer.signPayout({ payoutId: p.id, destination: p.destination, amount: p.amount }, life);
      const claimed = await db.query(
        `UPDATE payouts SET status = 'submitted', signature = $2, last_valid_block_height = $3, attempts = attempts + 1, updated_at = now()
         WHERE id = $1 AND status = 'requested'`,
        [p.id, signed.signature, life.lastValidBlockHeight.toString()],
      );
      if (!claimed.rowCount) continue;
      try {
        await chain.sendRawTransaction(signed.wireBase64);
      } catch (e) {
        if (!(e instanceof RpcUncertain)) {
          // Rejected before landing (e.g. preflight). The signature can never confirm: build again later.
          await db.query(
            `UPDATE payouts SET status = 'requested', signature = NULL, last_valid_block_height = NULL, last_error = $2, updated_at = now() WHERE id = $1`,
            [p.id, String((e as Error).message).slice(0, 300)],
          );
        }
      }
      summary.submitted++;
    } catch (e) {
      if (e instanceof RpcUncertain) {
        summary.waiting++;
        continue;
      }
      throw e;
    }
  }
  return summary;
}
