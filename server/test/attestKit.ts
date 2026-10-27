import 'reflect-metadata';
import { createHash, KeyObject, sign, webcrypto } from 'node:crypto';
import * as x509 from '@peculiar/x509';
import { encodeCbor } from '../src/attest/cbor.js';

/**
 * A stand-in for Apple's App Attest service: its own root and intermediate CA,
 * and "devices" whose keys are attested and sign assertions exactly the way
 * DCAppAttestService does.
 */
x509.cryptoProvider.set(webcrypto as unknown as Crypto);
const sha = (...b: Buffer[]) => b.reduce((h, x) => h.update(x), createHash('sha256')).digest();
const ALG = { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' } as const;
// Node's webcrypto types differ slightly from the DOM ones @peculiar/x509 uses.
const gen = async (): Promise<any> => webcrypto.subtle.generateKey(ALG, true, ['sign', 'verify']);

export async function fakeAttestCA() {
  const rootKeys = await gen();
  const interKeys = await gen();
  const notBefore = new Date(Date.now() - 86_400_000);
  const notAfter = new Date(Date.now() + 86_400_000 * 365);
  const ca = [new x509.BasicConstraintsExtension(true, undefined, true), new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign, true)];
  const root = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: '01', name: 'CN=Test App Attest Root', notBefore, notAfter, keys: rootKeys, signingAlgorithm: ALG, extensions: ca,
  });
  const inter = await x509.X509CertificateGenerator.create({
    serialNumber: '02', subject: 'CN=Test App Attest CA 1', issuer: root.subject, notBefore, notAfter,
    publicKey: interKeys.publicKey, signingKey: rootKeys.privateKey, signingAlgorithm: ALG, extensions: ca,
  });

  /** A device install: makes a Secure-Enclave-like key, attests it, signs requests. */
  const device = async (appId: string, opts: { env?: 'development' | 'production' } = {}) => {
    const keys = await gen();
    const spki = Buffer.from(await webcrypto.subtle.exportKey('spki', keys.publicKey));
    const keyIdRaw = sha(spki.subarray(spki.length - 65));
    const keyId = keyIdRaw.toString('base64');
    const priv = KeyObject.from(keys.privateKey);
    const aaguid = opts.env === 'production' ? Buffer.concat([Buffer.from('appattest'), Buffer.alloc(7)]) : Buffer.from('appattestdevelop');
    let counter = 0;

    const attest = async (challenge: string, over: { appId?: string; nonce?: Buffer } = {}) => {
      const cred = Buffer.alloc(2);
      cred.writeUInt16BE(32);
      const authData = Buffer.concat([sha(Buffer.from(over.appId ?? appId)), Buffer.from([0x41]), Buffer.alloc(4), aaguid, cred, keyIdRaw]);
      const nonce = over.nonce ?? sha(authData, sha(Buffer.from(challenge)));
      // SEQUENCE { [1] { OCTET STRING nonce } }
      const ext = Buffer.concat([Buffer.from([0x30, 0x24, 0xa1, 0x22, 0x04, 0x20]), nonce]);
      const leaf = await x509.X509CertificateGenerator.create({
        serialNumber: '03', subject: 'CN=device', issuer: inter.subject, notBefore, notAfter,
        publicKey: keys.publicKey, signingKey: interKeys.privateKey, signingAlgorithm: ALG,
        extensions: [new x509.Extension('1.2.840.113635.100.8.2', false, ext)],
      });
      const obj = new Map<any, any>([
        ['fmt', 'apple-appattest'],
        ['attStmt', new Map<any, any>([['x5c', [Buffer.from(leaf.rawData), Buffer.from(inter.rawData)]], ['receipt', Buffer.from('receipt')]])],
        ['authData', authData],
      ]);
      return encodeCbor(obj).toString('base64');
    };

    /** Signs clientData like generateAssertion(keyId, SHA256(clientData)). */
    const assert = (clientData: string, over: { counter?: number; appId?: string } = {}) => {
      counter = over.counter ?? counter + 1;
      const c = Buffer.alloc(4);
      c.writeUInt32BE(counter);
      const authenticatorData = Buffer.concat([sha(Buffer.from(over.appId ?? appId)), Buffer.from([0x01]), c]);
      const nonce = sha(authenticatorData, sha(Buffer.from(clientData)));
      const signature = sign('sha256', nonce, priv);
      return encodeCbor(new Map<any, any>([['signature', signature], ['authenticatorData', authenticatorData]])).toString('base64');
    };
    return { keyId, attest, assert };
  };

  return { rootPem: root.toString('pem'), device };
}
