import { randomUUID } from 'node:crypto';
import type { Queryable, Tx } from '../db/pool.js';

/**
 * Ledger accounts.
 *  treasury:deposits     source of all funds (the only account that goes negative)
 *  treasury:unallocated  funded, not promised to anyone
 *  treasury:reserved     held for accepted offers
 *  user:<id>:pending     awarded, in the review window
 *  user:<id>:available   can be paid out
 *  user:<id>:inflight    payout requested, not yet confirmed on chain
 *  user:<id>:paid        paid out (sink)
 */
export const A = {
  deposits: 'treasury:deposits',
  unallocated: 'treasury:unallocated',
  reserved: 'treasury:reserved',
  pending: (u: string) => `user:${u}:pending`,
  available: (u: string) => `user:${u}:available`,
  inflight: (u: string) => `user:${u}:inflight`,
  paid: (u: string) => `user:${u}:paid`,
};

/** Moves `amount` from one account to another as one balanced journal. Must run inside a transaction. */
export async function transfer(tx: Tx, from: string, to: string, amount: bigint, memo: string): Promise<string> {
  if (amount <= 0n) throw new Error('transfer amount must be positive');
  const journal = randomUUID();
  await tx.query(
    `INSERT INTO ledger_entries (journal_id, account, amount, memo) VALUES ($1, $2, $3, $5), ($1, $4, $6, $5)`,
    [journal, from, (-amount).toString(), to, memo, amount.toString()],
  );
  return journal;
}

export async function balance(q: Queryable, account: string): Promise<bigint> {
  const r = await q.query<{ s: bigint | null }>('SELECT SUM(amount)::int8 AS s FROM ledger_entries WHERE account = $1', [account]);
  return r.rows[0]?.s ?? 0n;
}

export async function userBalances(q: Queryable, userId: string) {
  const r = await q.query<{ account: string; s: bigint }>(
    `SELECT account, SUM(amount)::int8 AS s FROM ledger_entries WHERE account LIKE $1 GROUP BY account`,
    [`user:${userId}:%`],
  );
  const get = (a: string) => r.rows.find((x) => x.account === a)?.s ?? 0n;
  return {
    pending: get(A.pending(userId)),
    available: get(A.available(userId)),
    inflight: get(A.inflight(userId)),
    paid: get(A.paid(userId)),
  };
}

/** Totals across everyone: what's funded, promised, owed and paid. */
export async function treasuryTotals(q: Queryable) {
  const r = await q.query<{ k: string; s: bigint }>(`
    SELECT CASE
             WHEN account LIKE 'user:%:pending' THEN 'pending'
             WHEN account LIKE 'user:%:available' THEN 'available'
             WHEN account LIKE 'user:%:inflight' THEN 'inflight'
             WHEN account LIKE 'user:%:paid' THEN 'paid'
             ELSE account END AS k,
           SUM(amount)::int8 AS s
    FROM ledger_entries GROUP BY 1`);
  const get = (k: string) => r.rows.find((x) => x.k === k)?.s ?? 0n;
  const deposited = -get(A.deposits);
  const unallocated = get(A.unallocated);
  const reserved = get(A.reserved);
  const pending = get('pending');
  const available = get('available');
  const inflight = get('inflight');
  const paid = get('paid');
  return {
    deposited,
    unallocated,
    reserved,
    owed: pending + available + inflight,
    pending,
    available,
    inflight,
    paid,
    /** What must still be held in the treasury wallet. */
    mustHold: unallocated + reserved + pending + available + inflight,
  };
}
