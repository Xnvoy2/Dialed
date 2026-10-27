/**
 * Full money path against a RUNNING dev server (DIALED_DEV_AUTH=1, simulated payouts):
 * sign in, accept the 1-minute dev offer, really wait a minute, submit the session,
 * see the award, set an address, pay out and wait for it to settle.
 *   npx tsx scripts/e2e.mts [http://localhost:4020]
 */
const base = process.argv[2] ?? 'http://localhost:4020';
const j = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
  const r = await fetch(base + path, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await r.json();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(json)}`);
  return json as any;
};
const step = (s: string, v?: unknown) => console.log(`✓ ${s}${v !== undefined ? '  ' + JSON.stringify(v) : ''}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const auth = await j('POST', '/v1/auth/dev', { deviceId: `e2e-${Date.now()}` });
const h = { authorization: `Bearer ${auth.token}` };
step('signed in', auth.user.id);
step('me', await j('GET', '/v1/me', undefined, h));

const offers = await j('GET', '/v1/offers', undefined, h);
const offer = offers.find((o: any) => /1-minute/.test(o.title));
if (!offer) throw new Error('no 1-minute dev offer open');
const res = await j('POST', `/v1/offers/${offer.id}/accept`, {}, { ...h, 'idempotency-key': `e2e${Date.now()}` });
step('accepted', { reservation: res.id, amount: offer.amount });

const started = new Date();
console.log('… locking in for 65 s (server checks its own clock)');
await sleep(65_000);
const ended = new Date();
const s = await j('POST', '/v1/sessions', {
  clientSessionId: `e2e-${Date.now()}`, reservationId: res.id,
  startedAt: started.toISOString(), endedAt: ended.toISOString(),
  plannedSeconds: 60, activeSeconds: 64, pauseCount: 0, blockingApplied: true, appVersion: 'e2e',
}, h);
step('session', s);
if (s.outcome !== 'awarded') throw new Error('expected an award');

await sleep(16_000); // one tick: review window (0 h in dev) matures the award
let bal = await j('GET', '/v1/balances', undefined, h);
step('balances after award', bal);

await j('PUT', '/v1/me/payout-address', { address: 'GDfnEsia2WLAW5t8yx2X5j2mkfA74i5kwGdDuZHt7XmG' }, h);
step('payout address set');
const p = await j('POST', '/v1/payouts', { amount: bal.available }, { ...h, 'idempotency-key': `e2ep${Date.now()}` });
step('payout requested', p);

for (let i = 0; i < 8; i++) {
  await sleep(5_000);
  bal = await j('GET', '/v1/balances', undefined, h);
  if (bal.inflight === '0' && bal.paid !== '0') break;
}
step('balances after payout', bal);
step('activity', (await j('GET', '/v1/activity', undefined, h)));
if (bal.paid === '0') throw new Error('payout did not settle');

await j('DELETE', '/v1/me', { confirmForfeit: true }, h).catch((e) => console.log('  (cleanup delete:', e.message, ')'));
console.log('\ne2e OK');
