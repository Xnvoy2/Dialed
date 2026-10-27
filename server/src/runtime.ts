import { GENESIS, parseKeypairJson, type Config } from './config.js';
import type { Db } from './db/pool.js';
import { processPayouts, type PayoutDeps } from './domain/payouts.js';
import { runHousekeeping } from './domain/rewards.js';
import { kitChainClient } from './solana/chain.js';
import { TreasurySigner } from './solana/signer.js';

/** Loads the chain client and treasury signer for devnet or mainnet; nothing for simulated. */
export async function payoutDeps(cfg: Config): Promise<PayoutDeps> {
  if (cfg.network === 'simulated') return {};
  const chain = kitChainClient(cfg.rpcUrl);
  const genesis = await chain.getGenesisHash();
  // Refuse to run against any cluster but the configured one.
  if (genesis !== GENESIS[cfg.network]) throw new Error(`RPC is not Solana ${cfg.network} (genesis ${genesis}).`);
  let signer: TreasurySigner;
  if (cfg.signerKeypairPath) signer = await TreasurySigner.fromFile(cfg.signerKeypairPath, cfg.usdcMint, cfg.maxPayoutBaseUnits);
  else if (cfg.signerKeypairJson) {
    signer = await TreasurySigner.fromBytes(parseKeypairJson(cfg.signerKeypairJson, 'DIALED_SIGNER_KEY'), cfg.usdcMint, cfg.maxPayoutBaseUnits);
  } else throw new Error(`Set DIALED_SIGNER_KEYPAIR (file) or DIALED_SIGNER_KEY (secret) for ${cfg.network} payouts (run \`npm run dialed -- keygen\`).`);
  return { chain, signer };
}

export async function tick(db: Db, cfg: Config, deps: PayoutDeps) {
  const h = await runHousekeeping(db);
  const p = await processPayouts(db, cfg, deps);
  return { ...h, ...p };
}

const TICK_LOCK = '7310402024';

/**
 * Runs one tick unless another instance is already running one. Serverless
 * hosts start many copies of the server; only one should move money at a time.
 */
export async function tickOnce(db: Db, cfg: Config, deps: PayoutDeps) {
  const c = await db.connect();
  try {
    const got = (await c.query<{ ok: boolean }>('SELECT pg_try_advisory_lock($1) AS ok', [TICK_LOCK])).rows[0]?.ok;
    if (!got) return null;
    try {
      return await tick(db, cfg, deps);
    } finally {
      await c.query('SELECT pg_advisory_unlock($1)', [TICK_LOCK]).catch(() => {});
    }
  } finally {
    c.release();
  }
}

/**
 * After a payout request: tick, then keep checking for up to ~50 s while a
 * transaction is in flight, so payouts settle without waiting for the cron.
 */
export async function settleSoon(db: Db, cfg: Config, deps: PayoutDeps) {
  for (let i = 0; i < 8; i++) {
    const r = await tickOnce(db, cfg, deps);
    const open = await db.query<{ n: bigint }>(`SELECT count(*)::int8 AS n FROM payouts WHERE status IN ('requested','submitted')`);
    if (r && Number(open.rows[0]!.n) === 0) return;
    await new Promise((res) => setTimeout(res, 6_000));
  }
}
