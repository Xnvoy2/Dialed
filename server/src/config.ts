import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SERVER_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const USDC_DECIMALS = 6;
export const USDC_BASE = 1_000_000n;
/** Circle's devnet USDC (developers.circle.com/stablecoins/usdc-contract-addresses). */
export const DEVNET_USDC_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
export const MEMO_PROGRAM = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';

export class ConfigError extends Error {}

/**
 * Where payouts go.
 * - simulated: nothing touches a chain; every payout is labelled simulated.
 * - devnet: real Solana devnet transactions with Circle's devnet (test) USDC.
 * Mainnet is deliberately not an option in this codebase.
 */
export type PayoutNetwork = 'simulated' | 'devnet';
export type DialedEnv = 'development' | 'test' | 'staging';

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
  /** Hard ceiling per payout transaction, in base units. */
  maxPayoutBaseUnits: bigint;
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
  if (!['development', 'test', 'staging'].includes(e)) throw new ConfigError(`DIALED_ENV must be development, test or staging (got ${e}).`);

  const network = (env.DIALED_PAYOUT_NETWORK ?? 'simulated') as string;
  if (/main/i.test(network) || /mainnet/i.test(env.SOLANA_RPC_URL ?? '')) {
    throw new ConfigError('Mainnet is not supported. Dialed pays out on Solana devnet or in simulation only.');
  }
  if (network !== 'simulated' && network !== 'devnet') throw new ConfigError('DIALED_PAYOUT_NETWORK must be simulated or devnet.');

  const secret = env.DIALED_SESSION_SECRET ?? (e === 'staging' ? '' : 'dev-only-session-secret-change-me-0123456789');
  if (secret.length < 32) throw new ConfigError('DIALED_SESSION_SECRET must be at least 32 characters.');
  if (e === 'staging' && /dev-only/.test(secret)) throw new ConfigError('Set a real DIALED_SESSION_SECRET for staging.');

  const allowDevAuth = e !== 'staging' && env.DIALED_DEV_AUTH === '1';
  const databaseUrl =
    env.DATABASE_URL ?? (e === 'test' ? 'postgres://localhost/dialed_test' : 'postgres://localhost/dialed_dev');

  const maxUsdc = Number(env.DIALED_MAX_PAYOUT_USDC ?? '50');
  if (!(maxUsdc > 0)) throw new ConfigError('DIALED_MAX_PAYOUT_USDC must be positive.');

  return {
    env: e,
    port: Number(env.PORT ?? 4020),
    host: env.HOST ?? '0.0.0.0',
    databaseUrl,
    sessionSecret: new TextEncoder().encode(secret),
    appleBundleId: env.APPLE_BUNDLE_ID ?? 'com.joshbarton.dialed',
    allowDevAuth,
    network,
    rpcUrl: env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com',
    usdcMint: env.USDC_MINT ?? DEVNET_USDC_MINT,
    signerKeypairPath: env.DIALED_SIGNER_KEYPAIR ?? null,
    maxPayoutBaseUnits: BigInt(Math.round(maxUsdc * 1_000_000)),
    reviewHours: Number(env.DIALED_REVIEW_HOURS ?? (e === 'test' ? '0' : '24')),
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
