import { existsSync, writeFileSync } from 'node:fs';
import { generateKeyPairSigner } from '@solana/kit';
import { formatUsdc, loadConfig, parseUsdc } from '../config.js';
import { migrate } from '../db/migrate.js';
import { createPool } from '../db/pool.js';
import { treasuryTotals } from '../domain/ledger.js';
import { openOffer, programStatus, publishRule, recordDeposit, setOfferStatus } from '../domain/rewards.js';
import { payoutDeps, tick } from '../runtime.js';

/**
 * Operator tooling. Runs against DATABASE_URL with the server's config.
 *
 *   npm run dialed -- status
 *   npm run dialed -- deposit 100 --ref <devnet tx signature | label> --source "Founders"
 *   npm run dialed -- rule --version focus-25-v1 --title "Complete a 25-minute lock-in" --minutes 25 --amount 0.10 --daily 2 --weekly 8 [--blocking]
 *   npm run dialed -- offer open --rule focus-25-v1 --budget 50
 *   npm run dialed -- offer pause|open-again|close <offer id>
 *   npm run dialed -- tick
 *   npm run dialed -- keygen ~/.config/dialed/treasury-devnet.json
 */
const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const need = (name: string) => {
  const v = flag(name);
  if (!v) throw new Error(`--${name} is required`);
  return v;
};

const cfg = loadConfig();
const db = createPool(cfg.databaseUrl);

async function main() {
  await migrate(db, () => {});
  const cmd = args[0];
  switch (cmd) {
    case 'status': {
      const t = await treasuryTotals(db);
      const offers = await db.query<{ id: string; rule_version: string; status: string; budget_remaining: bigint; budget_total: bigint }>(
        'SELECT id, rule_version, status, budget_remaining, budget_total FROM offers ORDER BY created_at');
      console.log(`network      ${cfg.network}`);
      console.log(`program      ${await programStatus(db)}`);
      console.log(`deposited    ${formatUsdc(t.deposited)} USDC`);
      console.log(`unallocated  ${formatUsdc(t.unallocated)}`);
      console.log(`reserved     ${formatUsdc(t.reserved)}`);
      console.log(`owed         ${formatUsdc(t.owed)}  (pending ${formatUsdc(t.pending)}, available ${formatUsdc(t.available)}, in flight ${formatUsdc(t.inflight)})`);
      console.log(`paid         ${formatUsdc(t.paid)}`);
      console.log(`must hold    ${formatUsdc(t.mustHold)}`);
      if (cfg.network === 'devnet') {
        const { chain, signer } = await payoutDeps(cfg);
        const held = await chain!.getTokenAccountBalance(signer!.sourceTokenAccount);
        const sol = await chain!.getSolBalance(signer!.address);
        console.log(`treasury     ${signer!.address}`);
        console.log(`on chain     ${held == null ? 'no USDC account yet' : formatUsdc(held) + ' USDC'} · ${Number(sol) / 1e9} SOL`);
        if (held != null && held < t.mustHold) console.log('WARNING      on-chain USDC is below what the ledger says must be held');
      }
      for (const o of offers.rows) {
        console.log(`offer ${o.id}  ${o.rule_version}  ${o.status}  ${formatUsdc(o.budget_remaining)}/${formatUsdc(o.budget_total)} left`);
      }
      break;
    }
    case 'deposit': {
      const amount = parseUsdc(args[1] ?? '');
      const reference = need('ref');
      const source = flag('source') ?? 'Operator';
      if (cfg.network === 'devnet') {
        const { chain, signer } = await payoutDeps(cfg);
        const held = (await chain!.getTokenAccountBalance(signer!.sourceTokenAccount)) ?? 0n;
        const t = await treasuryTotals(db);
        if (held < t.mustHold + amount) {
          throw new Error(`On-chain treasury holds ${formatUsdc(held)} USDC; recording this deposit needs ${formatUsdc(t.mustHold + amount)}. Send the USDC first.`);
        }
      }
      const r = await recordDeposit(db, cfg, { amount, reference, source });
      console.log(r.duplicate ? `already recorded (${r.id})` : `recorded ${formatUsdc(amount)} USDC deposit ${r.id}`);
      break;
    }
    case 'rule': {
      await publishRule(db, {
        version: need('version'),
        title: need('title'),
        minActiveSeconds: Math.round(Number(need('minutes')) * 60),
        requiresBlocking: args.includes('--blocking'),
        amount: parseUsdc(need('amount')),
        dailyCap: Number(need('daily')),
        weeklyCap: Number(need('weekly')),
        terms: flag('terms') ??
          `Complete one ${need('minutes')}-minute lock-in after accepting. Fixed reward of ${need('amount')} USDC, at most ${need('daily')} per day and ${need('weekly')} per week (UTC). Paid after a 24-hour review. The server checks timings against its own clock; it cannot prove work happened.`,
      });
      console.log(`published rule ${need('version')}`);
      break;
    }
    case 'offer': {
      const sub = args[1];
      if (sub === 'open') {
        const id = await openOffer(db, { ruleVersion: need('rule'), budget: parseUsdc(need('budget')), ttlSeconds: flag('ttl') ? Number(flag('ttl')) : undefined });
        console.log(`opened offer ${id}`);
      } else if (sub === 'pause' || sub === 'close' || sub === 'open-again') {
        await setOfferStatus(db, args[2] ?? '', sub === 'open-again' ? 'open' : sub === 'pause' ? 'paused' : 'closed');
        console.log(`offer ${args[2]} ${sub}`);
      } else throw new Error('offer open|pause|open-again|close');
      break;
    }
    case 'tick': {
      console.log(await tick(db, cfg, await payoutDeps(cfg)));
      break;
    }
    case 'keygen': {
      const path = args[1];
      if (!path) throw new Error('keygen <path outside the repo>');
      if (existsSync(path)) throw new Error(`${path} already exists; refusing to overwrite a key.`);
      const signer = await generateKeyPairSigner(true);
      const { exportKeyPairBytes } = await import('./keybytes.js');
      writeFileSync(path, JSON.stringify(Array.from(await exportKeyPairBytes(signer.keyPair))), { mode: 0o600 });
      console.log(`devnet treasury address: ${signer.address}`);
      console.log(`key written to ${path} (mode 600). Set DIALED_SIGNER_KEYPAIR=${path}`);
      break;
    }
    default:
      console.log('commands: status | deposit | rule | offer | tick | keygen');
  }
}

main()
  .then(() => db.end())
  .catch(async (e) => {
    console.error(`error: ${(e as Error).message}`);
    await db.end();
    process.exit(1);
  });
