import { createSolanaRpc, type Address, type Signature, type Base64EncodedWireTransaction } from '@solana/kit';

/**
 * The narrow set of chain reads/writes the payout service uses. The kit-backed
 * implementation talks to a devnet RPC; tests substitute a fake that can model
 * dropped, delayed, failed and mismatched transactions. Every call has a timeout,
 * and a timeout is reported as RpcUncertain: the caller must not read it as
 * "nothing happened".
 */

export class RpcUncertain extends Error {}

export interface SignatureStatus { confirmationStatus: 'processed' | 'confirmed' | 'finalized' | null; err: unknown; slot: bigint }

export interface ChainClient {
  getGenesisHash(): Promise<string>;
  getLatestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: bigint }>;
  getBlockHeight(): Promise<bigint>;
  sendRawTransaction(base64: string): Promise<void>;
  getSignatureStatus(signature: string): Promise<SignatureStatus | null>;
  getParsedTransaction(signature: string, commitment: 'confirmed' | 'finalized'): Promise<any | null>;
  getTokenAccountBalance(tokenAccount: string): Promise<bigint | null>;
  getMintInfo(mint: string): Promise<{ owner: string; decimals: number } | null>;
  getSolBalance(address: string): Promise<bigint>;
}

const TIMEOUT_MS = 15_000;

async function timed<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  try {
    return await fn(signal);
  } catch (e) {
    if (signal.aborted || (e as Error)?.name === 'AbortError' || (e as Error)?.name === 'TimeoutError') {
      throw new RpcUncertain(`RPC timed out after ${TIMEOUT_MS}ms`);
    }
    if ((e as any)?.cause?.code === 'ECONNRESET' || /fetch failed|network/i.test(String((e as Error)?.message))) {
      throw new RpcUncertain(`RPC transport error: ${(e as Error).message}`);
    }
    throw e;
  }
}

export function kitChainClient(rpcUrl: string): ChainClient {
  const rpc = createSolanaRpc(rpcUrl);
  return {
    getGenesisHash: () => timed((s) => rpc.getGenesisHash().send({ abortSignal: s })),
    getLatestBlockhash: () => timed(async (s) => {
      const { value } = await rpc.getLatestBlockhash({ commitment: 'confirmed' }).send({ abortSignal: s });
      return { blockhash: value.blockhash, lastValidBlockHeight: value.lastValidBlockHeight };
    }),
    getBlockHeight: () => timed((s) => rpc.getBlockHeight({ commitment: 'confirmed' }).send({ abortSignal: s })),
    sendRawTransaction: (base64) => timed(async (s) => {
      await rpc.sendTransaction(base64 as Base64EncodedWireTransaction,
        { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 0n }).send({ abortSignal: s });
    }),
    getSignatureStatus: (sig) => timed(async (s) => {
      const { value } = await rpc.getSignatureStatuses([sig as Signature], { searchTransactionHistory: true }).send({ abortSignal: s });
      const v = value[0];
      return v ? { confirmationStatus: v.confirmationStatus ?? null, err: v.err, slot: BigInt(v.slot) } : null;
    }),
    getParsedTransaction: (sig, commitment) => timed((s) =>
      rpc.getTransaction(sig as Signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment }).send({ abortSignal: s })),
    getTokenAccountBalance: (acct) => timed(async (s) => {
      try {
        const { value } = await rpc.getTokenAccountBalance(acct as Address, { commitment: 'confirmed' }).send({ abortSignal: s });
        return BigInt(value.amount);
      } catch (e) {
        if (/could not find account|Invalid param/i.test(String((e as Error).message))) return null;
        throw e;
      }
    }),
    getMintInfo: (mint) => timed(async (s) => {
      const { value } = await rpc.getAccountInfo(mint as Address, { encoding: 'jsonParsed', commitment: 'confirmed' }).send({ abortSignal: s });
      if (!value) return null;
      const data: any = value.data;
      return { owner: value.owner, decimals: data?.parsed?.info?.decimals ?? -1 };
    }),
    getSolBalance: (addr) => timed(async (s) => (await rpc.getBalance(addr as Address, { commitment: 'confirmed' }).send({ abortSignal: s })).value),
  };
}
