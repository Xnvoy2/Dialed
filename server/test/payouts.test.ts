import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { generateKeyPairSigner } from '@solana/kit';
import { exportKeyPairBytes } from '../src/cli/keybytes.js';
import type { Db } from '../src/db/pool.js';
import { userBalances } from '../src/domain/ledger.js';
import { processPayouts, requestPayout } from '../src/domain/payouts.js';
import { acceptOffer, submitSession } from '../src/domain/rewards.js';
import { RpcUncertain, type ChainClient, type SignatureStatus } from '../src/solana/chain.js';
import { TreasurySigner } from '../src/solana/signer.js';
import { evidence, key, seedOffer, setup } from './helpers.js';

const pools: Db[] = [];
after(async () => {
  for (const p of pools) await p.end();
});

/** A chain we control: what the RPC says about each signature, block height, balances. */
function fakeChain() {
  const state = {
    height: 1000n,
    usdc: 10_000_000n as bigint | null,
    statuses: new Map<string, SignatureStatus>(),
    sent: [] as string[],
    sendMode: 'ok' as 'ok' | 'uncertain' | 'reject',
  };
  const chain: ChainClient = {
    getGenesisHash: async () => 'devnet',
    // A new blockhash once the height moves on, as on a real cluster.
    getLatestBlockhash: async () => ({
      blockhash: state.height > 1000n ? 'GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi' : '4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi',
      lastValidBlockHeight: state.height + 150n,
    }),
    getBlockHeight: async () => state.height,
    sendRawTransaction: async (b64) => {
      if (state.sendMode === 'uncertain') throw new RpcUncertain('timeout');
      if (state.sendMode === 'reject') throw new Error('preflight failed');
      state.sent.push(b64);
    },
    getSignatureStatus: async (sig) => state.statuses.get(sig) ?? null,
    getParsedTransaction: async () => null,
    getTokenAccountBalance: async () => state.usdc,
    getMintInfo: async () => ({ owner: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', decimals: 6 }),
    getSolBalance: async () => 1_000_000_000n,
  };
  return { chain, state };
}

async function scenario() {
  const s = await setup({ DIALED_PAYOUT_NETWORK: 'devnet' });
  pools.push(s.db);
  const offerId = await seedOffer(s.db, s.cfg);
  const u = await s.signIn(`apple-${Math.random()}`);
  const t = new Date(Date.now() - 30 * 60_000);
  const r = await acceptOffer(s.db, u.id, offerId, key(), t);
  await submitSession(s.db, s.cfg, u.id, evidence(r.id, t));
  await s.db.query('UPDATE users SET payout_address = $2 WHERE id = $1', [u.id, '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM']);
  const p = await requestPayout(s.db, s.cfg, u.id, 100_000n, key());
  const kp = await generateKeyPairSigner(true);
  const signer = await TreasurySigner.fromBytes(await exportKeyPairBytes(kp.keyPair), s.cfg.usdcMint, s.cfg.maxPayoutBaseUnits);
  const { chain, state } = fakeChain();
  const row = async () =>
    (await s.db.query<{ status: string; signature: string | null; attempts: number }>('SELECT status, signature, attempts FROM payouts WHERE id = $1', [p.id])).rows[0]!;
  return { ...s, u, deps: { chain, signer }, state, row };
}

describe('devnet payouts', () => {
  test('signature recorded before sending; confirmed → paid', async () => {
    const s = await scenario();
    await processPayouts(s.db, s.cfg, s.deps);
    const r1 = await s.row();
    assert.equal(r1.status, 'submitted');
    assert.ok(r1.signature);
    assert.equal(s.state.sent.length, 1);
    s.state.statuses.set(r1.signature!, { confirmationStatus: 'confirmed', err: null, slot: 1n });
    await processPayouts(s.db, s.cfg, s.deps);
    assert.equal((await s.row()).status, 'confirmed');
    assert.equal((await userBalances(s.db, s.u.id)).paid, 100_000n);
  });

  test('uncertain send is not retried while the old transaction could still land', async () => {
    const s = await scenario();
    s.state.sendMode = 'uncertain';
    await processPayouts(s.db, s.cfg, s.deps);
    const first = await s.row();
    assert.equal(first.status, 'submitted');
    s.state.sendMode = 'ok';
    await processPayouts(s.db, s.cfg, s.deps); // not found, blockhash still valid → wait
    assert.equal((await s.row()).signature, first.signature);
    assert.equal(s.state.sent.length, 0, 'no second transaction');
    s.state.height += 500n; // blockhash expired, never landed
    await processPayouts(s.db, s.cfg, s.deps); // → back to requested
    await processPayouts(s.db, s.cfg, s.deps); // → new transaction
    const second = await s.row();
    assert.equal(second.status, 'submitted');
    assert.notEqual(second.signature, first.signature);
    assert.equal(second.attempts, 2);
  });

  test('on-chain failure refunds the user', async () => {
    const s = await scenario();
    await processPayouts(s.db, s.cfg, s.deps);
    s.state.statuses.set((await s.row()).signature!, { confirmationStatus: 'confirmed', err: { InstructionError: [1, 'Custom'] }, slot: 1n });
    await processPayouts(s.db, s.cfg, s.deps);
    assert.equal((await s.row()).status, 'failed');
    const b = await userBalances(s.db, s.u.id);
    assert.deepEqual([b.available, b.inflight, b.paid], [100_000n, 0n, 0n]);
  });

  test('preflight rejection rebuilds instead of waiting', async () => {
    const s = await scenario();
    s.state.sendMode = 'reject';
    await processPayouts(s.db, s.cfg, s.deps);
    const r = await s.row();
    assert.equal(r.status, 'requested');
    assert.equal(r.signature, null);
  });

  test('a treasury short of USDC pauses offers and sends nothing', async () => {
    const s = await scenario();
    s.state.usdc = 50_000n;
    await processPayouts(s.db, s.cfg, s.deps);
    assert.equal((await s.row()).status, 'requested');
    assert.equal(s.state.sent.length, 0);
    const t = await s.db.query<{ paused: boolean }>('SELECT paused FROM treasury');
    assert.equal(t.rows[0]!.paused, true);
  });

  test('signer refuses bad destinations and amounts over the cap', async () => {
    const s = await scenario();
    const life = { blockhash: '4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi', lastValidBlockHeight: 10n };
    const id = '00000000-0000-4000-8000-000000000000';
    await assert.rejects(s.deps.signer.signPayout({ payoutId: id, destination: 'nope', amount: 1n }, life), /valid Solana address/);
    await assert.rejects(s.deps.signer.signPayout({ payoutId: id, destination: s.deps.signer.address, amount: 1n }, life), /treasury/);
    await assert.rejects(
      s.deps.signer.signPayout({ payoutId: id, destination: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM', amount: 10n ** 12n }, life),
      /limit/,
    );
  });
});
