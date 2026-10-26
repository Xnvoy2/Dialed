/** 64-byte Solana keypair (secret seed + public key) from an extractable WebCrypto Ed25519 pair. */
export async function exportKeyPairBytes(kp: CryptoKeyPair): Promise<Uint8Array> {
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', kp.privateKey));
  const seed = pkcs8.slice(pkcs8.length - 32);
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  const out = new Uint8Array(64);
  out.set(seed, 0);
  out.set(pub, 32);
  return out;
}
