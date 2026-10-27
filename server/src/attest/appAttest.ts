import { createHash, createPublicKey, verify, X509Certificate } from 'node:crypto';
import { decodeCbor, type Cbor } from './cbor.js';

/**
 * Apple App Attest verification, following
 * developer.apple.com/documentation/devicecheck/validating-apps-that-connect-to-your-server
 *
 * Attestation (once per install): proves a key lives in the Secure Enclave of a
 * real Apple device, inside this exact app (team id + bundle id).
 * Assertion (per sensitive request): proves the request was signed by that key.
 * The counter must increase every time, so a captured request can't be replayed.
 */
export class AttestError extends Error {}

const sha256 = (...parts: Buffer[]) => {
  const h = createHash('sha256');
  for (const p of parts) h.update(p);
  return h.digest();
};
const fail = (m: string): never => {
  throw new AttestError(m);
};

const NONCE_OID = Buffer.from([0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x63, 0x64, 0x08, 0x02]); // 1.2.840.113635.100.8.2
const AAGUID_DEV = Buffer.from('appattestdevelop', 'ascii');
const AAGUID_PROD = Buffer.concat([Buffer.from('appattest', 'ascii'), Buffer.alloc(7)]);

export type AttestEnvironment = 'development' | 'production';

export interface AttestedKey {
  keyId: string;
  publicKeySpki: Buffer;
  environment: AttestEnvironment;
  receipt: Buffer | null;
}

/** Reads one DER TLV at `off`. */
function tlv(buf: Buffer, off: number) {
  if (off + 2 > buf.length) fail('der: truncated');
  const tag = buf[off]!;
  let len = buf[off + 1]!;
  let start = off + 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n < 1 || n > 3) fail('der: bad length');
    len = 0;
    for (let i = 0; i < n; i++) len = (len << 8) | buf[start + i]!;
    start += n;
  }
  if (start + len > buf.length) fail('der: truncated');
  return { tag, start, end: start + len };
}

/** The 32-byte nonce Apple writes into the credential certificate. */
export function certNonce(certDer: Buffer): Buffer {
  const at = certDer.indexOf(NONCE_OID);
  if (at < 0) fail('credential certificate has no nonce extension');
  let o = at + NONCE_OID.length;
  let t = tlv(certDer, o);
  if (t.tag === 0x01) { o = t.end; t = tlv(certDer, o); } // optional "critical" flag
  if (t.tag !== 0x04) fail('nonce extension: expected OCTET STRING');
  const seq = tlv(certDer, t.start);
  if (seq.tag !== 0x30) fail('nonce extension: expected SEQUENCE');
  const tagged = tlv(certDer, seq.start);
  if (tagged.tag !== 0xa1) fail('nonce extension: expected [1]');
  const oct = tlv(certDer, tagged.start);
  if (oct.tag !== 0x04 || oct.end - oct.start !== 32) fail('nonce extension: expected 32-byte OCTET STRING');
  return certDer.subarray(oct.start, oct.end);
}

function mapGet(m: Cbor, k: string): Cbor {
  if (!(m instanceof Map)) fail('expected a CBOR map');
  return (m as Map<Cbor, Cbor>).get(k);
}

export const appId = (teamId: string, bundleId: string) => `${teamId}.${bundleId}`;

export function verifyAttestation(opts: {
  attestationB64: string;
  keyIdB64: string;
  challenge: string;
  appId: string;
  rootPem: string;
  allow: 'development' | 'production' | 'either';
  now?: Date;
}): AttestedKey {
  const obj = decodeCbor(Buffer.from(opts.attestationB64, 'base64'));
  if (mapGet(obj, 'fmt') !== 'apple-appattest') fail('not an App Attest object');
  const stmt = mapGet(obj, 'attStmt');
  const authData = mapGet(obj, 'authData');
  const x5c = mapGet(stmt, 'x5c');
  const receipt = mapGet(stmt, 'receipt');
  if (!Buffer.isBuffer(authData) || !Array.isArray(x5c) || x5c.length < 2 || !x5c.every(Buffer.isBuffer)) fail('malformed attestation');

  // 1. Certificate chain: credential cert ← intermediate ← Apple's root.
  const now = opts.now ?? new Date();
  const root = new X509Certificate(opts.rootPem);
  const [leaf, inter] = (x5c as Buffer[]).map((d) => new X509Certificate(d)) as [X509Certificate, X509Certificate];
  for (const c of [leaf, inter, root]) {
    if (new Date(c.validFrom) > now || new Date(c.validTo) < now) fail('certificate outside its validity period');
  }
  if (!leaf.checkIssued(inter) || !leaf.verify(inter.publicKey)) fail('credential certificate not issued by the intermediate');
  if (!inter.checkIssued(root) || !inter.verify(root.publicKey)) fail('intermediate not issued by the Apple App Attest root');

  // 2–4. Nonce = SHA256(authData ‖ SHA256(challenge)) must match the certificate.
  const nonce = sha256(authData as Buffer, sha256(Buffer.from(opts.challenge, 'utf8')));
  if (!certNonce(leaf.raw).equals(nonce)) fail('nonce mismatch');

  // 5. Key id = SHA256 of the public key point.
  const spki = leaf.publicKey.export({ type: 'spki', format: 'der' }) as Buffer;
  const point = spki.subarray(spki.length - 65);
  const keyId = Buffer.from(opts.keyIdB64, 'base64');
  if (keyId.length !== 32 || !sha256(point).equals(keyId)) fail('key id does not match the attested key');

  // 6–9. Authenticator data.
  const ad = authData as Buffer;
  if (ad.length < 55) fail('authenticator data too short');
  if (!ad.subarray(0, 32).equals(sha256(Buffer.from(opts.appId, 'utf8')))) fail('attestation is for a different app');
  if (ad.readUInt32BE(33) !== 0) fail('new key counter must be 0');
  const aaguid = ad.subarray(37, 53);
  const environment: AttestEnvironment | null = aaguid.equals(AAGUID_PROD) ? 'production' : aaguid.equals(AAGUID_DEV) ? 'development' : null;
  if (!environment) fail('unknown App Attest environment');
  if (opts.allow !== 'either' && opts.allow !== environment) fail(`App Attest ${environment} keys are not accepted here`);
  const credLen = ad.readUInt16BE(53);
  if (!ad.subarray(55, 55 + credLen).equals(keyId)) fail('credential id does not match the key id');

  return { keyId: opts.keyIdB64, publicKeySpki: Buffer.from(spki), environment: environment!, receipt: Buffer.isBuffer(receipt) ? receipt : null };
}

/** Verifies one assertion. Returns the new counter, which must be stored. */
export function verifyAssertion(opts: {
  assertionB64: string;
  clientData: string;
  publicKeySpki: Buffer;
  lastCounter: number;
  appId: string;
}): number {
  const obj = decodeCbor(Buffer.from(opts.assertionB64, 'base64'));
  const sig = mapGet(obj, 'signature');
  const ad = mapGet(obj, 'authenticatorData');
  if (!Buffer.isBuffer(sig) || !Buffer.isBuffer(ad) || ad.length < 37) fail('malformed assertion');
  const a = ad as Buffer;
  const nonce = sha256(a, sha256(Buffer.from(opts.clientData, 'utf8')));
  const key = createPublicKey({ key: opts.publicKeySpki, format: 'der', type: 'spki' });
  if (!verify('sha256', nonce, key, sig as Buffer)) fail('assertion signature invalid');
  if (!a.subarray(0, 32).equals(sha256(Buffer.from(opts.appId, 'utf8')))) fail('assertion is for a different app');
  const counter = a.readUInt32BE(33);
  if (counter <= opts.lastCounter) fail('assertion counter did not increase (replay?)');
  return counter;
}

/** What the app signs for a request: method, path and a hash of the exact body. */
export function requestClientData(method: string, path: string, rawBody: string): string {
  return `${method.toUpperCase()} ${path}\n${createHash('sha256').update(rawBody, 'utf8').digest('hex')}`;
}
