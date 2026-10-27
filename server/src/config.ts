import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SERVER_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const USDC_DECIMALS = 6;
export const USDC_BASE = 1_000_000n;
/** Circle's devnet USDC (developers.circle.com/stablecoins/usdc-contract-addresses). */
export const DEVNET_USDC_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
/** Circle's mainnet USDC. Fixed on mainnet: it can't be overridden. */
export const MAINNET_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const GENESIS = {
  devnet: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
  mainnet: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',
} as const;
/** Mainnet hard ceilings. Env vars can lower these, never raise them. */
export const MAINNET_CEILING = { perPayoutUsdc: 25, dailyUsdc: 500 };
export const MEMO_PROGRAM = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';

export class ConfigError extends Error {}

/**
 * Where payouts go.
 * - simulated: nothing touches a chain; every payout is labelled simulated.
 * - devnet: real Solana devnet transactions with Circle's devnet (test) USDC.
 * - mainnet: REAL USDC. Only in production, only with DIALED_REAL_MONEY=yes,
 *   and always with App Attest, a 24 h+ review, per-payout and daily caps.
 */
export type PayoutNetwork = 'simulated' | 'devnet' | 'mainnet';
export type DialedEnv = 'development' | 'test' | 'staging' | 'production';
/** Which App Attest environments to accept: dev-signed builds, App Store/TestFlight builds, or both. */
export type AttestEnv = 'development' | 'production' | 'either';

export interface Config {
  env: DialedEnv;
  port: number;
  host: string;
  databaseUrl: string;
  sessionSecret: Uint8Array;
  appleBundleId: string;
  /** Lets the simulator (no Apple Account) sign in. Never on in staging. */
  allowDevAuth: boolean;
  network: PayoutNetwork;
  rpcUrl: string;
  usdcMint: string;
  signerKeypairPath: string | null;
  /** Keypair JSON given directly (hosted secrets). Used when no path is set. */
  signerKeypairJson: string | null;
  /** Hard ceiling per payout transaction, in base units. */
  maxPayoutBaseUnits: bigint;
  /** Smallest payout a user can request, in base units. */
  minPayoutBaseUnits: bigint;
  /** Total requested across all users in any rolling 24 h, in base units. */
  dailyPayoutCapBaseUnits: bigint;
  /** Sensitive requests must carry a valid App Attest assertion. */
  requireAttest: boolean;
  attestEnv: AttestEnv;
  /** Apple Developer Team ID; with the bundle id forms the App Attest app id. */
  appleTeamId: string;
  /** Hours an award stays pending before it can be paid out. */
  reviewHours: number;
  tickSeconds: number;
}

function loadDotEnv(): void {
  const p = resolve(SERVER_ROOT, '.env');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]!] !== undefined) continue;
    process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, '');
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  if (env === process.env) loadDotEnv();
  const e = (env.DIALED_ENV ?? 'development') as DialedEnv;
  if (!['development', 'test', 'staging', 'production'].includes(e)) {
    throw new ConfigError(`DIALED_ENV must be development, test, staging or production (got ${e}).`);
  }
  const strict = e === 'staging' || e === 'production';

  const network = (env.DIALED_PAYOUT_NETWORK ?? 'simulated') as string;
  if (network !== 'simulated' && network !== 'devnet' && network !== 'mainnet') {
    throw new ConfigError('DIALED_PAYOUT_NETWORK must be simulated, devnet or mainnet.');
  }
  const mainnet = network === 'mainnet';
  if (network === 'devnet' && /mainnet/i.test(env.SOLANA_RPC_URL ?? '')) {
    throw new ConfigError('SOLANA_RPC_URL points at mainnet but DIALED_PAYOUT_NETWORK is devnet.');
  }
  if (mainnet) {
    if (e !== 'production') throw new ConfigError('Mainnet payouts need DIALED_ENV=production.');
    if (env.DIALED_REAL_MONEY !== 'yes') throw new ConfigError('Mainnet moves real USDC. Set DIALED_REAL_MONEY=yes to confirm.');
    if (!env.SOLANA_RPC_URL || /devnet|testnet/i.test(env.SOLANA_RPC_URL)) throw new ConfigError('Set SOLANA_RPC_URL to a mainnet RPC.');
    if (env.USDC_MINT && env.USDC_MINT !== MAINNET_USDC_MINT) throw new ConfigError('USDC_MINT cannot be changed on mainnet.');
    if (!env.APPLE_TEAM_ID) throw new ConfigError('Set APPLE_TEAM_ID (App Attest is required on mainnet).');
  }
  if (e === 'production' && network !== 'mainnet' && network !== 'devnet') {
    throw new ConfigError('Production pays out on devnet or mainnet, not in simulation.');
  }

  const secret = env.DIALED_SESSION_SECRET ?? (strict ? '' : 'dev-only-session-secret-change-me-0123456789');
  if (secret.length < 32) throw new ConfigError('DIALED_SESSION_SECRET must be at least 32 characters.');
  if (strict && /dev-only/.test(secret)) throw new ConfigError(`Set a real DIALED_SESSION_SECRET for ${e}.`);

  const allowDevAuth = !strict && env.DIALED_DEV_AUTH === '1';
  const databaseUrl =
    env.DATABASE_URL ?? (e === 'test' ? 'postgres://localhost/dialed_test' : 'postgres://localhost/dialed_dev');
  if (strict && !env.DATABASE_URL) throw new ConfigError(`Set DATABASE_URL for ${e}.`);

  const usd = (name: string, fallback: number) => {
    const v = Number(env[name] ?? fallback);
    if (!(v > 0) || !Number.isFinite(v)) throw new ConfigError(`${name} must be a positive number.`);
    return v;
  };
  const maxUsdc = usd('DIALED_MAX_PAYOUT_USDC', mainnet ? 5 : 50);
  const dailyUsdc = usd('DIALED_DAILY_PAYOUT_CAP_USDC', mainnet ? 25 : 1_000_000);
  const minUsdc = usd('DIALED_MIN_PAYOUT_USDC', mainnet ? 1 : 0.000001);
  if (mainnet && maxUsdc > MAINNET_CEILING.perPayoutUsdc) {
    throw new ConfigError(`DIALED_MAX_PAYOUT_USDC can be at most ${MAINNET_CEILING.perPayoutUsdc} on mainnet.`);
  }
  if (mainnet && dailyUsdc > MAINNET_CEILING.dailyUsdc) {
    throw new ConfigError(`DIALED_DAILY_PAYOUT_CAP_USDC can be at most ${MAINNET_CEILING.dailyUsdc} on mainnet.`);
  }
  if (minUsdc > maxUsdc) throw new ConfigError('DIALED_MIN_PAYOUT_USDC is above DIALED_MAX_PAYOUT_USDC.');
  const base = (v: number) => BigInt(Math.round(v * 1_000_000));

  const reviewHours = Number(env.DIALED_REVIEW_HOURS ?? (e === 'test' ? '0' : '24'));
  if (mainnet && !(reviewHours >= 24)) throw new ConfigError('DIALED_REVIEW_HOURS must be at least 24 on mainnet.');

  const requireAttest = mainnet || env.DIALED_REQUIRE_ATTEST === '1';
  const attestEnv = (env.DIALED_ATTEST_ENV ?? 'either') as AttestEnv;
  if (!['development', 'production', 'either'].includes(attestEnv)) throw new ConfigError('DIALED_ATTEST_ENV must be development, production or either.');
  if (requireAttest && !env.APPLE_TEAM_ID) throw new ConfigError('APPLE_TEAM_ID is required when App Attest is required.');

  return {
    env: e,
    port: Number(env.PORT ?? 4020),
    host: env.HOST ?? '0.0.0.0',
    databaseUrl,
    sessionSecret: new TextEncoder().encode(secret),
    appleBundleId: env.APPLE_BUNDLE_ID ?? 'com.joshbarton.dialed',
    appleTeamId: env.APPLE_TEAM_ID ?? 'PPNNNASZJX',
    allowDevAuth,
    network,
    rpcUrl: env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com',
    usdcMint: mainnet ? MAINNET_USDC_MINT : (env.USDC_MINT ?? DEVNET_USDC_MINT),
    signerKeypairPath: env.DIALED_SIGNER_KEYPAIR ?? null,
    signerKeypairJson: env.DIALED_SIGNER_KEY ?? null,
    maxPayoutBaseUnits: base(maxUsdc),
    minPayoutBaseUnits: base(minUsdc),
    dailyPayoutCapBaseUnits: base(dailyUsdc),
    requireAttest,
    attestEnv,
    reviewHours,
    tickSeconds: Number(env.DIALED_TICK_SECONDS ?? '15'),
  };
}

export function parseKeypairJson(text: string, label: string): Uint8Array {
  let arr: unknown;
  try {
    arr = JSON.parse(text);
  } catch {
    throw new ConfigError(`${label} is not valid JSON (expected a 64-number array).`);
  }
  if (!Array.isArray(arr) || arr.length !== 64 || !arr.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
    throw new ConfigError(`${label} must be a JSON array of 64 integers 0..255 (a Solana keypair).`);
  }
  return Uint8Array.from(arr as number[]);
}

/** "1.5" → 1500000n. Rejects more than 6 decimals and negatives. */
export function parseUsdc(text: string): bigint {
  const m = String(text).trim().match(/^(\d+)(?:\.(\d{1,6}))?$/);
  if (!m) throw new ConfigError(`"${text}" is not a USDC amount (up to 6 decimals).`);
  return BigInt(m[1]!) * USDC_BASE + BigInt((m[2] ?? '').padEnd(6, '0') || '0');
}

export function formatUsdc(base: bigint): string {
  const neg = base < 0n;
  const v = neg ? -base : base;
  const whole = v / USDC_BASE;
  const frac = (v % USDC_BASE).toString().padStart(6, '0').replace(/0+$/, '');
  return `${neg ? '-' : ''}${whole}${frac ? '.' + frac : ''}`;
}
