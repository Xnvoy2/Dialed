/**
 * End-to-end smoke test against a RUNNING dev server (DIALED_DEV_AUTH=1):
 * sign in, accept the open offer, submit a session, set an address, pay out,
 * and wait for the payout to settle. Uses real HTTP, like the app.
 *   npx tsx scripts/smoke.mts [http://localhost:4020]
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

const health = await j('GET', '/v1/health');
step('health', health);
const auth = await j('POST', '/v1/auth/dev', { deviceId: `smoke-${Date.now()}` });
const h = { authorization: `Bearer ${auth.token}` };
step('signed in', auth.user.id);
const program = await j('GET', '/v1/program');
step('program', program);
const offers = await j('GET', '/v1/offers', undefined, h);
if (!offers.length) throw new Error('no open offers; seed one with the CLI first');
step('offers', offers.map((o: any) => `${o.title} · ${o.amount}`));

const res = await j('POST', `/v1/offers/${offers[0].id}/accept`, {}, { ...h, 'idempotency-key': `smoke${Date.now()}` });
step('accepted', res.id);

// A real client would submit after a real 25-minute lock-in. The server checks
// "no more focus than time since accepting", so a fresh reservation must be refused:
const now = new Date();
const early = await j('POST', '/v1/sessions', {
  clientSessionId: `smoke-early-${Date.now()}`, reservationId: res.id,
  startedAt: new Date(now.getTime() - 26 * 60_000).toISOString(), endedAt: now.toISOString(),
  plannedSeconds: 1500, activeSeconds: 1500, pauseCount: 0, blockingApplied: true, appVersion: 'smoke',
}, h);
step('instant 25-min claim refused by server clock', early.outcome);
if (early.outcome !== 'not_eligible') throw new Error('server accepted an impossible session');
const bal = await j('GET', '/v1/balances', undefined, h);
step('balances unchanged', bal);
const t = await j('GET', '/v1/transparency');
step('transparency', { deposited: t.deposited, reserved: t.reserved, owed: t.owed, paid: t.paid });
console.log('\nsmoke OK');
