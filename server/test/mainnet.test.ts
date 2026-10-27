import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { ConfigError, MAINNET_USDC_MINT, loadConfig } from '../src/config.js';
import type { Db } from '../src/db/pool.js';
import { A, transfer } from '../src/domain/ledger.js';
import { processPayouts, requestPayout } from '../src/domain/payouts.js';
import { withTx } from '../src/db/pool.js';
import { key, setup } from './helpers.js';
import { recordDeposit } from '../src/domain/rewards.js';

const MAIN = {
  DIALED_ENV: 'production',
  DIALED_PAYOUT_NETWORK: 'mainnet',
  DIALED_REAL_MONEY: 'yes',
  DIALED_SESSION_SECRET: 'p'.repeat(48),
  DATABASE_URL: 'postgres://db/dialed',
  SOLANA_RPC_URL: 'https://mainnet.helius-rpc.com/?api-key=x',
  APPLE_TEAM_ID: 'PPNNNASZJX',
};
const pools: Db[] = [];
after(async () => {
  for (const p of pools) await p.end();
});

describe('mainnet config', () => {
  test('a complete production setup loads with safe defaults', () => {
    const c = loadConfig(MAIN);
    assert.equal(c.network, 'mainnet');
    assert.equal(c.usdcMint, MAINNET_USDC_MINT);
    assert.equal(c.requireAttest, true);
    assert.equal(c.allowDevAuth, false);
    assert.equal(c.reviewHours, 24);
    assert.equal(c.maxPayoutBaseUnits, 5_000_000n);
    assert.equal(c.minPayoutBaseUnits, 1_000_000n);
    assert.equal(c.dailyPayoutCapBaseUnits, 25_000_000n);
  });
  test('each missing safeguard is refused', () => {
    const without = (k: keyof typeof MAIN) => {
      const e: Record<string, string> = { ...MAIN };
      delete e[k];
      return e;
    };
    for (const k of ['DIALED_REAL_MONEY', 'SOLANA_RPC_URL', 'APPLE_TEAM_ID', 'DATABASE_URL', 'DIALED_SESSION_SECRET'] as const) {
      assert.throws(() => loadConfig(without(k)), ConfigError, k);
    }
    assert.throws(() => loadConfig({ ...MAIN, DIALED_ENV: 'staging' }), ConfigError);
    assert.throws(() => loadConfig({ ...MAIN, DIALED_REAL_MONEY: 'true' }), ConfigError);
    assert.throws(() => loadConfig({ ...MAIN, SOLANA_RPC_URL: 'https://api.devnet.solana.com' }), ConfigError);
    assert.throws(() => loadConfig({ ...MAIN, USDC_MINT: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU' }), ConfigError);
    assert.throws(() => loadConfig({ ...MAIN, DIALED_REVIEW_HOURS: '1' }), ConfigError);
    assert.throws(() => loadConfig({ ...MAIN, DIALED_MAX_PAYOUT_USDC: '100' }), ConfigError);
    assert.throws(() => loadConfig({ ...MAIN, DIALED_DAILY_PAYOUT_CAP_USDC: '10000' }), ConfigError);
    assert.throws(() => loadConfig({ ...MAIN, DIALED_ATTEST_ENV: 'nope' }), ConfigError);
    // Attest can't be turned off on mainnet.
    assert.equal(loadConfig({ ...MAIN, DIALED_REQUIRE_ATTEST: '0' }).requireAttest, true);
  });
  test('production refuses simulated payouts', () => {
    assert.throws(() => loadConfig({ ...MAIN, DIALED_PAYOUT_NETWORK: 'simulated' }), ConfigError);
  });
});

describe('payout limits and kill switch', () => {
  async function funded(over: Record<string, string>) {
    const s = await setup(over);
    pools.push(s.db);
    await recordDeposit(s.db, s.cfg, { amount: 100_000_000n, reference: 'seed', source: 'Founders' });
    const users = [];
    for (const n of ['a', 'b', 'c']) {
      const u = await s.signIn(`apple-${n}`);
      await withTx(s.db, (tx) => transfer(tx, A.unallocated, A.available(u.id), 10_000_000n, `grant:${u.id}`));
      await s.db.query('UPDATE users SET payout_address = $2 WHERE id = $1', [u.id, 'GDfnEsia2WLAW5t8yx2X5j2mkfA74i5kwGdDuZHt7XmG']);
      users.push(u);
    }
    return { ...s, users };
  }

  test('minimum, per-payout maximum and rolling daily cap', async () => {
    const s = await funded({ DIALED_MIN_PAYOUT_USDC: '1', DIALED_MAX_PAYOUT_USDC: '4', DIALED_DAILY_PAYOUT_CAP_USDC: '6' });
    const [a, b, c] = s.users;
    await assert.rejects(requestPayout(s.db, s.cfg, a!.id, 500_000n, key()), /smallest payout/);
    await assert.rejects(requestPayout(s.db, s.cfg, a!.id, 5_000_000n, key()), /at most 4/);
    await requestPayout(s.db, s.cfg, a!.id, 4_000_000n, key());
    await requestPayout(s.db, s.cfg, b!.id, 2_000_000n, key());
    await assert.rejects(requestPayout(s.db, s.cfg, c!.id, 1_000_000n, key()), /limit/);
  });

  test('pausing stops new payouts going out and new requests; resuming sends them', async () => {
    const s = await funded({});
    const [a, b] = s.users;
    await requestPayout(s.db, s.cfg, a!.id, 1_000_000n, key());
    await s.db.query('UPDATE treasury SET payouts_paused = true WHERE id = 1');
    assert.equal((await processPayouts(s.db, s.cfg)).confirmed, 0);
    await assert.rejects(requestPayout(s.db, s.cfg, b!.id, 1_000_000n, key()), /paused/);
    await s.db.query('UPDATE treasury SET payouts_paused = false WHERE id = 1');
    assert.equal((await processPayouts(s.db, s.cfg)).confirmed, 1);
  });
});
