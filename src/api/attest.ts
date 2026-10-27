import * as AppIntegrity from '@expo/app-integrity';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * App Attest: proves to the rewards server that requests come from this app on
 * a real iPhone, not a script. One Secure Enclave key per install, attested
 * once with Apple, then used to sign every request that claims or moves money.
 * The simulator doesn't support it; development servers don't require it there.
 */
const STORE = 'dialed.attest.v1';

interface Saved {
  keyId: string;
  registered: boolean;
}

export const attestSupported = () => Platform.OS === 'ios' && AppIntegrity.isSupported;

async function load(): Promise<Saved | null> {
  try {
    const s = await SecureStore.getItemAsync(STORE);
    return s ? (JSON.parse(s) as Saved) : null;
  } catch {
    return null;
  }
}
const save = (s: Saved | null) => (s ? SecureStore.setItemAsync(STORE, JSON.stringify(s)) : SecureStore.deleteItemAsync(STORE)).catch(() => {});

/** Server calls the registration needs, passed in to avoid a cycle with the client. */
export interface AttestServer {
  challenge(): Promise<{ challenge: string }>;
  register(body: { keyId: string; attestation: string; challenge: string }): Promise<unknown>;
}

let inflight: Promise<string> | null = null;

/** Returns a registered key id, creating and attesting one if needed. */
export function ensureDeviceKey(server: AttestServer, opts: { fresh?: boolean } = {}): Promise<string> {
  inflight ??= (async () => {
    let s = opts.fresh ? null : await load();
    if (!s) {
      s = { keyId: await AppIntegrity.generateKeyAsync(), registered: false };
      await save(s);
    }
    if (!s.registered) {
      const { challenge } = await server.challenge();
      const attestation = await AppIntegrity.attestKeyAsync(s.keyId, challenge);
      await server.register({ keyId: s.keyId, attestation, challenge });
      s = { ...s, registered: true };
      await save(s);
    }
    return s.keyId;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

/** The server forgot this key (or it belongs to another account): start over. */
export async function forgetRegistration(newKey: boolean) {
  const s = await load();
  await save(newKey || !s ? null : { ...s, registered: false });
}

/** Headers proving this exact request (method, path, body) came from this app. */
export async function signRequest(keyId: string, method: string, path: string, rawBody: string): Promise<Record<string, string>> {
  const bodyHash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawBody, { encoding: Crypto.CryptoEncoding.HEX });
  const assertion = await AppIntegrity.generateAssertionAsync(keyId, `${method.toUpperCase()} ${path}\n${bodyHash}`);
  return { 'x-dialed-key-id': keyId, 'x-dialed-assertion': assertion };
}
