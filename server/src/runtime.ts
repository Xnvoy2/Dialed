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
