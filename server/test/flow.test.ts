import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { ConfigError, loadConfig, parseUsdc } from '../src/config.js';
import { withTx, type Db } from '../src/db/pool.js';
import { A, treasuryTotals, transfer } from '../src/domain/ledger.js';
import { processPayouts } from '../src/domain/payouts.js';
import { acceptOffer, runHousekeeping, submitSession } from '../src/domain/rewards.js';
import { evidence, key, seedOffer, setup } from './helpers.js';

const pools: Db[] = [];
after(async () => {
  for (const p of pools) await p.end();
});

describe('config', () => {
  test('mainnet is refused', () => {
    assert.throws(() => loadConfig({ DIALED_ENV: 'test', DIALED_PAYOUT_NETWORK: 'mainnet' }), ConfigError);
    assert.throws(() => loadConfig({ DIALED_ENV: 'test', DIALED_PAYOUT_NETWORK: 'devnet', SOLANA_RPC_URL: 'https://api.mainnet-beta.solana.com' }), ConfigError);
  });
  test('staging needs a real secret and never allows dev sign-in', () => {
    assert.throws(() => loadConfig({ DIALED_ENV: 'staging' }), ConfigError);
    const c = loadConfig({ DIALED_ENV: 'staging', DIALED_SESSION_SECRET: 'x'.repeat(40), DIALED_DEV_AUTH: '1' });
    assert.equal(c.allowDevAuth, false);
  });
  test('USDC parsing is exact', () => {
    assert.equal(parseUsdc('0.1'), 100_000n);
    assert.equal(parseUsdc('12.345678'), 12_345_678n);
    assert.throws(() => parseUsdc('1.0000001'));
    assert.throws(() => parseUsdc('-1'));
  });
});

describe('Sign in with Apple', () => {
  test('verified token signs in; same Apple id is the same user', async () => {
    const { app, db, signIn } = await setup();
    pools.push(db);
    const a = await signIn('apple-user-1');
    const b = await signIn('apple-user-1');
    assert.equal(a.id, b.id);
    const me = await app.inject({ method: 'GET', url: '/v1/me', headers: a.h });
    assert.equal(me.statusCode, 200);
  });

  test('wrong audience, issuer, expired or forged tokens are rejected', async () => {
    const { app, db, apple } = await setup();
    pools.push(db);
    const bad = [
      await apple.token('u', { aud: 'com.someone.else' }),
      await apple.token('u', { iss: 'https://evil.example' }),
      await apple.token('u', { exp: '-1m' }),
      'eyJhbGciOiJub25lIn0.eyJzdWIiOiJ1In0.',
    ];
    for (const identityToken of bad) {
      const r = await app.inject({ method: 'POST', url: '/v1/auth/apple', payload: { identityToken } });
      assert.equal(r.statusCode, 401, identityToken.slice(0, 20));
    }
  });

  test('dev sign-in only exists when enabled', async () => {
    const off = await setup();
    pools.push(off.db);
    assert.equal((await off.app.inject({ method: 'POST', url: '/v1/auth/dev', payload: { deviceId: 'abcdefgh-123' } })).statusCode, 404);
    const on = await setup({ DIALED_DEV_AUTH: '1' });
    pools.push(on.db);
    assert.equal((await on.app.inject({ method: 'POST', url: '/v1/auth/dev', payload: { deviceId: 'abcdefgh-123' } })).statusCode, 200);
  });

  test('no token, bad token and revoked sessions are refused', async () => {
    const { app, db, signIn } = await setup();
    pools.push(db);
    assert.equal((await app.inject({ method: 'GET', url: '/v1/balances' })).statusCode, 401);
    assert.equal((await app.inject({ method: 'GET', url: '/v1/balances', headers: { authorization: 'Bearer nope' } })).statusCode, 401);
    const u = await signIn('apple-2');
    await app.inject({ method: 'POST', url: '/v1/me/sign-out-everywhere', headers: u.h });
    assert.equal((await app.inject({ method: 'GET', url: '/v1/balances', headers: u.h })).statusCode, 401);
  });
});

describe('rewards flow (simulated payouts)', () => {
  test('fund → offer → accept → session → award → payout, ledger stays solvent', async () => {
    const { app, db, cfg, signIn } = await setup();
    pools.push(db);
    const offerId = await seedOffer(db, cfg);
    const u = await signIn('apple-flow');

    assert.equal((await app.inject({ method: 'GET', url: '/v1/program' })).json().status, 'live');
    const offers = (await app.inject({ method: 'GET', url: '/v1/offers', headers: u.h })).json();
    assert.equal(offers.length, 1);
    assert.equal(offers[0].amount, '100000');

    const acceptedAt = new Date(Date.now() - 30 * 60_000);
    const res = await acceptOffer(db, u.id, offerId, key(), acceptedAt);
    const d = await submitSession(db, cfg, u.id, evidence(res.id, acceptedAt));
    assert.equal(d.outcome, 'awarded');

    const bal = (await app.inject({ method: 'GET', url: '/v1/balances', headers: u.h })).json();
    assert.equal(bal.available, '100000');
    assert.equal(bal.network, 'simulated');

    const noAddr = await app.inject({ method: 'POST', url: '/v1/payouts', headers: { ...u.h, 'idempotency-key': key() }, payload: { amount: '100000' } });
    assert.equal(noAddr.json().error, 'no_address');
    const badAddr = await app.inject({ method: 'PUT', url: '/v1/me/payout-address', headers: u.h, payload: { address: 'not-an-address' } });
    assert.equal(badAddr.statusCode, 400);
    await app.inject({ method: 'PUT', url: '/v1/me/payout-address', headers: u.h, payload: { address: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM' } });

    const idem = key();
    const p1 = await app.inject({ method: 'POST', url: '/v1/payouts', headers: { ...u.h, 'idempotency-key': idem }, payload: { amount: '100000' } });
    const p2 = await app.inject({ method: 'POST', url: '/v1/payouts', headers: { ...u.h, 'idempotency-key': idem }, payload: { amount: '100000' } });
    assert.equal(p1.json().id, p2.json().id, 'same key, same payout');
    const over = await app.inject({ method: 'POST', url: '/v1/payouts', headers: { ...u.h, 'idempotency-key': key() }, payload: { amount: '1' } });
    assert.equal(over.json().error, 'insufficient');

    await processPayouts(db, cfg);
    const act = (await app.inject({ method: 'GET', url: '/v1/activity', headers: u.h })).json();
    assert.equal(act.payouts[0].status, 'confirmed');
    assert.match(act.payouts[0].signature, /^SIMULATED-/);
    const after = (await app.inject({ method: 'GET', url: '/v1/balances', headers: u.h })).json();
    assert.deepEqual([after.available, after.inflight, after.paid], ['0', '0', '100000']);

    const t = await treasuryTotals(db);
    assert.equal(t.mustHold, t.deposited - t.paid);
    const tr = (await app.inject({ method: 'GET', url: '/v1/transparency' })).json();
    assert.equal(tr.sources[0].source, 'Founders');
    assert.equal(tr.paid, '100000');
  });

  test('idempotent accept and duplicate session submission', async () => {
    const { db, cfg, signIn } = await setup();
    pools.push(db);
    const offerId = await seedOffer(db, cfg);
    const u = await signIn('apple-idem');
    const t = new Date(Date.now() - 40 * 60_000);
    const k = key();
    const a = await acceptOffer(db, u.id, offerId, k, t);
    const b = await acceptOffer(db, u.id, offerId, k, t);
    assert.equal(a.id, b.id);
    const ev = evidence(a.id, t);
    assert.equal((await submitSession(db, cfg, u.id, ev)).outcome, 'awarded');
    assert.equal((await submitSession(db, cfg, u.id, ev)).outcome, 'duplicate');
  });

  test('pending awards mature after the review window', async () => {
    const { db, cfg, signIn } = await setup({ DIALED_REVIEW_HOURS: '24' });
    pools.push(db);
    const offerId = await seedOffer(db, cfg);
    const u = await signIn('apple-review');
    const t = new Date(Date.now() - 30 * 60_000);
    const r = await acceptOffer(db, u.id, offerId, key(), t);
    const d = await submitSession(db, cfg, u.id, evidence(r.id, t));
    assert.equal(d.outcome === 'awarded' && d.state, 'pending');
    assert.equal((await runHousekeeping(db)).matured, 0);
    assert.equal((await runHousekeeping(db, new Date(Date.now() + 25 * 3600_000))).matured, 1);
  });
});

describe('limits and funding', () => {
  test('daily cap', async () => {
    const { db, cfg, signIn } = await setup();
    pools.push(db);
    const offerId = await seedOffer(db, cfg, { daily: 1 });
    const u = await signIn('apple-cap');
    const t = new Date(Date.now() - 30 * 60_000);
    const r = await acceptOffer(db, u.id, offerId, key(), t);
    await submitSession(db, cfg, u.id, evidence(r.id, t));
    await assert.rejects(acceptOffer(db, u.id, offerId, key()), /Daily limit/);
  });

  test('running out of funds pauses new offers but honours existing ones; a deposit resumes', async () => {
    const { app, db, cfg, signIn } = await setup();
    pools.push(db);
    const offerId = await seedOffer(db, cfg, { deposit: 150_000n, budget: 1_000_000n });
    const a = await signIn('apple-a');
    const b = await signIn('apple-b');
    const t = new Date(Date.now() - 30 * 60_000);
    const ra = await acceptOffer(db, a.id, offerId, key(), t);
    await assert.rejects(acceptOffer(db, b.id, offerId, key()), /paused/);
    assert.equal((await app.inject({ method: 'GET', url: '/v1/program' })).json().status, 'paused_no_funds');
    assert.equal((await submitSession(db, cfg, a.id, evidence(ra.id, t))).outcome, 'awarded', 'existing reservation still pays');
    const { recordDeposit } = await import('../src/domain/rewards.js');
    await recordDeposit(db, cfg, { amount: 1_000_000n, reference: 'topup', source: 'Founders' });
    await runHousekeeping(db);
    assert.equal((await app.inject({ method: 'GET', url: '/v1/program' })).json().status, 'live');
  });

  test('concurrent accepts never overspend the budget', async () => {
    const { db, cfg, signIn } = await setup();
    pools.push(db);
    const offerId = await seedOffer(db, cfg, { budget: 500_000n, daily: 10, weekly: 10 });
    const users = await Promise.all(Array.from({ length: 12 }, (_, i) => signIn(`apple-c${i}`)));
    const results = await Promise.allSettled(users.map((u) => acceptOffer(db, u.id, offerId, key())));
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 5);
    const t = await treasuryTotals(db);
    assert.equal(t.reserved, 500_000n);
  });

  test('expired reservations return money and budget', async () => {
    const { db, cfg, signIn } = await setup();
    pools.push(db);
    const offerId = await seedOffer(db, cfg);
    const u = await signIn('apple-exp');
    await acceptOffer(db, u.id, offerId, key());
    assert.equal((await treasuryTotals(db)).reserved, 100_000n);
    assert.equal((await runHousekeeping(db, new Date(Date.now() + 2 * 86400_000))).expired, 1);
    assert.equal((await treasuryTotals(db)).reserved, 0n);
    const o = await db.query<{ budget_remaining: bigint }>('SELECT budget_remaining FROM offers WHERE id = $1', [offerId]);
    assert.equal(o.rows[0]!.budget_remaining, 1_000_000n);
  });
});

describe('session checks', () => {
  const cases: [string, (acc: Date) => Record<string, unknown>, RegExp][] = [
    ['too short', () => ({ activeSeconds: 600 }), /25 active minutes/],
    ['started before accepting', (acc) => ({ startedAt: new Date(acc.getTime() - 10 * 60_000).toISOString() }), /before the offer was accepted/],
    ['active longer than session', (acc) => ({ endedAt: new Date(acc.getTime() + 120_000).toISOString() }), /longer than the session/],
    ['ends in the future', () => ({ endedAt: new Date(Date.now() + 3600_000).toISOString() }), /future/],
  ];
  for (const [name, over, re] of cases) {
    test(name, async () => {
      const { db, cfg, signIn } = await setup();
      pools.push(db);
      const offerId = await seedOffer(db, cfg);
      const u = await signIn(`apple-${name}`);
      const acc = new Date(Date.now() - 30 * 60_000);
      const r = await acceptOffer(db, u.id, offerId, key(), acc);
      const d = await submitSession(db, cfg, u.id, evidence(r.id, acc, over(acc)));
      assert.equal(d.outcome, 'not_eligible');
      assert.match((d as { reason: string }).reason, re);
      assert.equal((await treasuryTotals(db)).reserved, 0n, 'rejection releases the reservation');
    });
  }

  test('cannot claim more focus than time since accepting (server clock)', async () => {
    const { db, cfg, signIn } = await setup();
    pools.push(db);
    const offerId = await seedOffer(db, cfg);
    const u = await signIn('apple-clock');
    const acc = new Date(Date.now() - 5 * 60_000); // accepted 5 minutes ago
    const r = await acceptOffer(db, u.id, offerId, key(), acc);
    const start = new Date(acc.getTime());
    const d = await submitSession(db, cfg, u.id, evidence(r.id, acc, {
      startedAt: start.toISOString(), endedAt: new Date().toISOString(), activeSeconds: 1500,
    }));
    assert.equal(d.outcome, 'not_eligible');
  });

  test('blocking requirement', async () => {
    const { db, cfg, signIn } = await setup();
    pools.push(db);
    const offerId = await seedOffer(db, cfg, { blocking: true });
    const u = await signIn('apple-block');
    const acc = new Date(Date.now() - 30 * 60_000);
    const r = await acceptOffer(db, u.id, offerId, key(), acc);
    const d = await submitSession(db, cfg, u.id, evidence(r.id, acc, { blockingApplied: false }));
    assert.match((d as { reason: string }).reason, /requires app blocking/);
  });

  test('someone else’s reservation is not found', async () => {
    const { db, cfg, signIn } = await setup();
    pools.push(db);
    const offerId = await seedOffer(db, cfg);
    const a = await signIn('apple-x');
    const b = await signIn('apple-y');
    const acc = new Date(Date.now() - 30 * 60_000);
    const r = await acceptOffer(db, a.id, offerId, key(), acc);
    await assert.rejects(submitSession(db, cfg, b.id, evidence(r.id, acc)), /No such reservation/);
  });
});

describe('ledger integrity', () => {
  test('unbalanced journals, negative balances and edits are impossible', async () => {
    const { db } = await setup();
    pools.push(db);
    await assert.rejects(
      withTx(db, (tx) => tx.query(`INSERT INTO ledger_entries (journal_id, account, amount, memo) VALUES (gen_random_uuid(), 'treasury:unallocated', 5, 'x')`)),
      /does not balance/,
    );
    await assert.rejects(withTx(db, (tx) => transfer(tx, A.unallocated, A.reserved, 5n, 'x')), /negative/);
    await withTx(db, (tx) => transfer(tx, A.deposits, A.unallocated, 5n, 'seed'));
    await assert.rejects(db.query(`UPDATE ledger_entries SET amount = 1`), /append-only/);
    await assert.rejects(db.query(`DELETE FROM ledger_entries`), /append-only/);
    await assert.rejects(db.query(`TRUNCATE ledger_entries`), /append-only/);
  });
});

describe('account deletion', () => {
  test('requires confirming forfeit, returns funds, revokes sessions, unlinks Apple id', async () => {
    const { app, db, cfg, signIn } = await setup();
    pools.push(db);
    const offerId = await seedOffer(db, cfg);
    const u = await signIn('apple-del');
    const acc = new Date(Date.now() - 30 * 60_000);
    const r = await acceptOffer(db, u.id, offerId, key(), acc);
    await submitSession(db, cfg, u.id, evidence(r.id, acc));
    const before = (await treasuryTotals(db)).unallocated;
    const refused = await app.inject({ method: 'DELETE', url: '/v1/me', headers: u.h, payload: {} });
    assert.equal(refused.json().error, 'has_balance');
    const ok = await app.inject({ method: 'DELETE', url: '/v1/me', headers: u.h, payload: { confirmForfeit: true } });
    assert.equal(ok.statusCode, 200);
    assert.equal((await treasuryTotals(db)).unallocated, before + 100_000n);
    assert.equal((await app.inject({ method: 'GET', url: '/v1/me', headers: u.h })).statusCode, 401);
    const row = await db.query<{ apple_sub: string }>('SELECT apple_sub FROM users WHERE id = $1', [u.id]);
    assert.match(row.rows[0]!.apple_sub, /^deleted:/);
    const again = await signIn('apple-del');
    assert.notEqual(again.id, u.id, 'signing in again starts a fresh account');
  });
});
