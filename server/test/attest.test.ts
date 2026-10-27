import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { requestClientData } from '../src/attest/appAttest.js';
import type { Db } from '../src/db/pool.js';
import { fakeAttestCA } from './attestKit.js';
import { key, seedOffer, setup } from './helpers.js';

const APP = 'PPNNNASZJX.com.joshbarton.dialed';
const pools: Db[] = [];
after(async () => {
  for (const p of pools) await p.end();
});
let ca: Awaited<ReturnType<typeof fakeAttestCA>>;
before(async () => {
  ca = await fakeAttestCA();
});

async function env(over: Record<string, string> = {}) {
  const s = await setup({ DIALED_REQUIRE_ATTEST: '1', APPLE_TEAM_ID: 'PPNNNASZJX', ...over }, { attestRootPem: ca.rootPem });
  pools.push(s.db);
  const offerId = await seedOffer(s.db, s.cfg);
  const u = await s.signIn(`apple-${Math.random()}`);
  const register = async (dev: Awaited<ReturnType<typeof ca.device>>, who = u, tweak: Parameters<typeof dev.attest>[1] = {}) => {
    const c = (await s.app.inject({ method: 'POST', url: '/v1/attest/challenge', headers: who.h })).json() as { challenge: string };
    return s.app.inject({
      method: 'POST', url: '/v1/attest/keys', headers: who.h,
      payload: { keyId: dev.keyId, challenge: c.challenge, attestation: await dev.attest(c.challenge, tweak) },
    });
  };
  /** A signed request, like the app makes it. */
  const signed = (dev: Awaited<ReturnType<typeof ca.device>>, method: 'POST' | 'PUT', url: string, body: unknown, over: { counter?: number; tamper?: boolean; who?: typeof u } = {}) => {
    const raw = JSON.stringify(body);
    const assertion = dev.assert(requestClientData(method, url, raw), { counter: over.counter });
    return s.app.inject({
      method, url,
      headers: { ...(over.who ?? u).h, 'content-type': 'application/json', 'idempotency-key': key(), 'x-dialed-key-id': dev.keyId, 'x-dialed-assertion': assertion },
      payload: over.tamper ? JSON.stringify({ ...(body as object), extra: 1 }) : raw,
    });
  };
  return { ...s, offerId, u, register, signed };
}

describe('App Attest', () => {
  test('attested device can accept an offer; unsigned requests are refused', async () => {
    const t = await env();
    const dev = await ca.device(APP);
    const r = await t.register(dev);
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(r.json().environment, 'development');

    const plain = await t.app.inject({ method: 'POST', url: `/v1/offers/${t.offerId}/accept`, headers: { ...t.u.h, 'idempotency-key': key() }, payload: {} });
    assert.equal(plain.statusCode, 401);
    assert.equal(plain.json().error, 'attest_required');

    const ok = await t.signed(dev, 'POST', `/v1/offers/${t.offerId}/accept`, {});
    assert.equal(ok.statusCode, 200, ok.body);
  });

  test('replayed, tampered and wrong-app assertions are refused', async () => {
    const t = await env();
    const dev = await ca.device(APP);
    await t.register(dev);
    const addr = { address: 'GDfnEsia2WLAW5t8yx2X5j2mkfA74i5kwGdDuZHt7XmG' };
    assert.equal((await t.signed(dev, 'PUT', '/v1/me/payout-address', addr, { counter: 5 })).statusCode, 200);
    // Same counter again = replay.
    assert.equal((await t.signed(dev, 'PUT', '/v1/me/payout-address', addr, { counter: 5 })).statusCode, 401);
    // Body changed after signing.
    assert.equal((await t.signed(dev, 'PUT', '/v1/me/payout-address', addr, { counter: 6, tamper: true })).statusCode, 401);
    // Signed for another path.
    const raw = JSON.stringify(addr);
    const a = dev.assert(requestClientData('PUT', '/v1/me/other', raw), { counter: 7 });
    const wrongPath = await t.app.inject({
      method: 'PUT', url: '/v1/me/payout-address', payload: raw,
      headers: { ...t.u.h, 'content-type': 'application/json', 'x-dialed-key-id': dev.keyId, 'x-dialed-assertion': a },
    });
    assert.equal(wrongPath.statusCode, 401);
    // Next honest request still works.
    assert.equal((await t.signed(dev, 'PUT', '/v1/me/payout-address', addr, { counter: 8 })).statusCode, 200);
  });

  test('attestations for another app, with a bad nonce, or from an unknown CA are rejected', async () => {
    const t = await env();
    assert.equal((await t.register(await ca.device(APP), t.u, { appId: 'XXXXXXXXXX.com.someone.else' })).statusCode, 401);
    assert.equal((await t.register(await ca.device(APP), t.u, { nonce: Buffer.alloc(32, 7) })).statusCode, 401);
    const other = await fakeAttestCA();
    assert.equal((await t.register(await other.device(APP))).statusCode, 401);
  });

  test('a challenge works once; a key can never move to another account', async () => {
    const t = await env();
    const dev = await ca.device(APP);
    const c = (await t.app.inject({ method: 'POST', url: '/v1/attest/challenge', headers: t.u.h })).json() as { challenge: string };
    const payload = { keyId: dev.keyId, challenge: c.challenge, attestation: await dev.attest(c.challenge) };
    assert.equal((await t.app.inject({ method: 'POST', url: '/v1/attest/keys', headers: t.u.h, payload })).statusCode, 200);
    assert.equal((await t.app.inject({ method: 'POST', url: '/v1/attest/keys', headers: t.u.h, payload })).statusCode, 400);

    const other = await t.signIn('apple-other');
    assert.equal((await t.register(dev, other)).statusCode, 409);
    // Someone else's key can't sign this user's requests.
    const d2 = await ca.device(APP);
    await t.register(d2, other);
    assert.equal((await t.signed(d2, 'POST', `/v1/offers/${t.offerId}/accept`, {})).statusCode, 401);
  });

  test('production-only servers refuse development keys', async () => {
    const t = await env({ DIALED_ATTEST_ENV: 'production' });
    assert.equal((await t.register(await ca.device(APP))).statusCode, 401);
    const r = await t.register(await ca.device(APP, { env: 'production' }));
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(r.json().environment, 'production');
  });
});
