import { readFileSync, statSync } from 'node:fs';
import {
  appendTransactionMessageInstructions, createKeyPairSignerFromBytes, createTransactionMessage,
  getBase64EncodedWireTransaction, getSignatureFromTransaction, isAddress, pipe,
  setTransactionMessageFeePayerSigner, setTransactionMessageLifetimeUsingBlockhash, signTransactionMessageWithSigners,
  type Address, type Blockhash, type KeyPairSigner,
} from '@solana/kit';
import {
  findAssociatedTokenPda, getCreateAssociatedTokenIdempotentInstruction, getTransferCheckedInstruction, TOKEN_PROGRAM_ADDRESS,
} from '@solana-program/token';
import { getAddMemoInstruction } from '@solana-program/memo';
import { MEMO_PROGRAM, USDC_DECIMALS, parseKeypairJson } from '../config.js';

/**
 * The treasury signer. Server-side only. It never signs arbitrary
 * transactions: it builds each payout itself (create the recipient's token
 * account if missing, transferChecked of the configured mint from its own
 * account, and a memo), with a per-transfer cap. The treasury pays the SOL fee
 * and account rent, so users never need SOL. The key is read from a mode-600
 * file outside the repo and is never logged or returned.
 */
export class SignerPolicyError extends Error {}

export interface SignedPayout { signature: string; wireBase64: string; sourceTokenAccount: string; destinationTokenAccount: string }

export class TreasurySigner {
  private constructor(private signer: KeyPairSigner, readonly mint: Address, readonly sourceTokenAccount: Address, private max: bigint) {}

  get address(): string { return this.signer.address; }

  static async fromBytes(bytes: Uint8Array, mint: string, max: bigint) {
    let signer: KeyPairSigner;
    try {
      signer = await createKeyPairSignerFromBytes(bytes);
    } catch {
      throw new SignerPolicyError('treasury keypair is invalid');
    }
    const [ata] = await findAssociatedTokenPda({ owner: signer.address, mint: mint as Address, tokenProgram: TOKEN_PROGRAM_ADDRESS });
    return new TreasurySigner(signer, mint as Address, ata, max);
  }

  static async fromFile(path: string, mint: string, max: bigint) {
    if (statSync(path).mode & 0o077) throw new SignerPolicyError(`${path} must not be readable by group/other (chmod 600)`);
    return TreasurySigner.fromBytes(parseKeypairJson(readFileSync(path, 'utf8'), path), mint, max);
  }

  async signPayout(spec: { payoutId: string; destination: string; amount: bigint }, lifetime: { blockhash: string; lastValidBlockHeight: bigint }): Promise<SignedPayout> {
    if (!isAddress(spec.destination)) throw new SignerPolicyError('destination is not a valid Solana address');
    if (spec.destination === this.signer.address) throw new SignerPolicyError('destination cannot be the treasury');
    if (spec.amount <= 0n || spec.amount > this.max) throw new SignerPolicyError(`amount outside the per-payout limit`);
    if (!/^[0-9a-f-]{36}$/.test(spec.payoutId)) throw new SignerPolicyError('payout id malformed');
    const owner = spec.destination as Address;
    const [destAta] = await findAssociatedTokenPda({ owner, mint: this.mint, tokenProgram: TOKEN_PROGRAM_ADDRESS });
    const message = pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(this.signer, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash({ blockhash: lifetime.blockhash as Blockhash, lastValidBlockHeight: lifetime.lastValidBlockHeight }, m),
      (m) => appendTransactionMessageInstructions([
        getCreateAssociatedTokenIdempotentInstruction({ payer: this.signer, ata: destAta, owner, mint: this.mint }),
        getTransferCheckedInstruction({
          source: this.sourceTokenAccount, mint: this.mint, destination: destAta, authority: this.signer,
          amount: spec.amount, decimals: USDC_DECIMALS,
        }),
        getAddMemoInstruction({ memo: `dialed:payout:${spec.payoutId}` }, { programAddress: MEMO_PROGRAM as Address }),
      ], m),
    );
    const signed = await signTransactionMessageWithSigners(message);
    return {
      signature: getSignatureFromTransaction(signed),
      wireBase64: getBase64EncodedWireTransaction(signed),
      sourceTokenAccount: this.sourceTokenAccount,
      destinationTokenAccount: destAta,
    };
  }
}
