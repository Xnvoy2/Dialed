import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import {
  ActivityDTO,
  AwardDecision,
  BalancesDTO,
  OfferDTO,
  PayoutDTO,
  ProgramInfo,
  ReservationDTO,
  RewardsApi,
  SessionEvidence,
  TransparencyDTO,
} from '../domain/rewardsApi';
import { attestSupported, ensureDeviceKey, forgetRegistration, signRequest } from './attest';

/** Server base URL from the build (DIALED_API_URL). Null means no server: rewards show as not live. */
export const API_URL: string | null = (Constants.expoConfig?.extra?.apiUrl as string | undefined) || null;

const TOKEN_KEY = 'dialed.session.v1';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function getToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}
export async function setToken(token: string | null): Promise<void> {
  if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
  else await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
}

export function newIdempotencyKey(): string {
  return `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

interface CallOpts {
  headers?: Record<string, string>;
  /** Claims or moves money: sign with App Attest when the device supports it. */
  signed?: boolean;
}

async function call<T>(method: string, path: string, body?: unknown, opts: CallOpts = {}, retried = false): Promise<T> {
  if (!API_URL) throw new ApiError(0, 'no_server', 'Rewards server not configured.');
  const token = await getToken();
  const raw = body !== undefined ? JSON.stringify(body) : undefined;
  let device: Record<string, string> = {};
  if (opts.signed && attestSupported()) {
    try {
      const keyId = await ensureDeviceKey(attestServer);
      device = await signRequest(keyId, method, path, raw ?? '');
    } catch (e) {
      if (e instanceof ApiError) throw e;
      throw new ApiError(0, 'attest_device', 'This iPhone couldn’t be verified with Apple. Check your connection and try again.');
    }
  }
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(raw !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...device,
        ...opts.headers,
      },
      body: raw,
    });
  } catch {
    throw new ApiError(0, 'offline', 'Can’t reach the rewards server.');
  }
  const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!res.ok) {
    const code = json.error ?? 'error';
    // The server doesn't know this device key (e.g. it was reset): attest again, once.
    if (!retried && opts.signed && attestSupported() && (code === 'attest_unknown_key' || code === 'attest_required')) {
      await forgetRegistration(false);
      return call<T>(method, path, body, opts, true);
    }
    if (res.status === 401 && !code.startsWith('attest')) await setToken(null);
    throw new ApiError(res.status, code, json.message ?? 'Request failed.');
  }
  return json as T;
}

const attestServer = {
  challenge: () => call<{ challenge: string }>('POST', '/v1/attest/challenge', {}),
  register: async (b: { keyId: string; attestation: string; challenge: string }) => {
    try {
      return await call('POST', '/v1/attest/keys', b);
    } catch (e) {
      // Key linked to another account on this phone: next try makes a fresh one.
      if ((e as ApiError).code === 'key_taken') await forgetRegistration(true);
      throw e;
    }
  },
};

export interface SessionUser {
  id: string;
  displayName: string | null;
  payoutAddress: string | null;
}

export const api = {
  signInWithApple: async (identityToken: string, displayName: string | null) => {
    const r = await call<{ token: string; user: SessionUser }>('POST', '/v1/auth/apple', { identityToken, displayName });
    await setToken(r.token);
    return r.user;
  },
  /** Development servers only (DIALED_DEV_AUTH=1): the simulator has no Apple Account. */
  signInDev: async (deviceId: string) => {
    const r = await call<{ token: string; user: SessionUser }>('POST', '/v1/auth/dev', { deviceId });
    await setToken(r.token);
    return r.user;
  },
  signOut: async () => {
    await setToken(null);
    await forgetRegistration(true);
  },
  me: () => call<SessionUser>('GET', '/v1/me'),
  setPayoutAddress: (address: string | null) => call<{ payoutAddress: string | null }>('PUT', '/v1/me/payout-address', { address }, { signed: true }),
  deleteAccount: (confirmForfeit: boolean) => call<{ deleted: boolean }>('DELETE', '/v1/me', { confirmForfeit }),
  activity: () => call<ActivityDTO>('GET', '/v1/activity'),
  transparency: () => call<TransparencyDTO>('GET', '/v1/transparency'),
  releaseReservation: (id: string) => call<{ released: boolean }>('POST', `/v1/reservations/${id}/release`, {}),
};

export const httpRewardsApi: RewardsApi = {
  program: () => call<ProgramInfo>('GET', '/v1/program'),
  offers: () => call<OfferDTO[]>('GET', '/v1/offers'),
  acceptOffer: (offerId, key) => call<ReservationDTO>('POST', `/v1/offers/${offerId}/accept`, {}, { signed: true, headers: { 'idempotency-key': key } }),
  submitSession: (evidence: SessionEvidence) => call<AwardDecision>('POST', '/v1/sessions', evidence, { signed: true }),
  balances: () => call<BalancesDTO>('GET', '/v1/balances'),
  requestPayout: (amount, key) => call<PayoutDTO>('POST', '/v1/payouts', { amount }, { signed: true, headers: { 'idempotency-key': key } }),
};
