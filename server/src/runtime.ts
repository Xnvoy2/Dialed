import type { Config } from './config.js';
import type { Db } from './db/pool.js';
import { processPayouts, type PayoutDeps } from './domain/payouts.js';
import { runHousekeeping } from './domain/rewards.js';
import { kitChainClient } from './solana/chain.js';
import { TreasurySigner } from './solana/signer.js';

/** Loads the chain client and treasury signer for devnet; nothing for simulated. */
export async function payoutDeps(cfg: Config): Promise<PayoutDeps> {
  if (cfg.network !== 'devnet') return {};
  if (!cfg.signerKeypairPath) throw new Error('DIALED_SIGNER_KEYPAIR is required for devnet payouts (run `npm run dialed -- keygen`).');
  const chain = kitChainClient(cfg.rpcUrl);
  const genesis = await chain.getGenesisHash();
  // Devnet genesis hash: refuse to run against any other cluster.
  if (genesis !== 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG') throw new Error(`RPC is not Solana devnet (genesis ${genesis}).`);
  const signer = await TreasurySigner.fromFile(cfg.signerKeypairPath, cfg.usdcMint, cfg.maxPayoutBaseUnits);
  return { chain, signer };
}

export async function tick(db: Db, cfg: Config, deps: PayoutDeps) {
  const h = await runHousekeeping(db);
  const p = await processPayouts(db, cfg, deps);
  return { ...h, ...p };
}
