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

async function call<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  if (!API_URL) throw new ApiError(0, 'no_server', 'Rewards server not configured.');
  const token = await getToken();
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'offline', 'Can’t reach the rewards server.');
  }
  const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!res.ok) {
    if (res.status === 401) await setToken(null);
    throw new ApiError(res.status, json.error ?? 'error', json.message ?? 'Request failed.');
  }
  return json as T;
}

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
  signOut: () => setToken(null),
  me: () => call<SessionUser>('GET', '/v1/me'),
  setPayoutAddress: (address: string | null) => call<{ payoutAddress: string | null }>('PUT', '/v1/me/payout-address', { address }),
  deleteAccount: (confirmForfeit: boolean) => call<{ deleted: boolean }>('DELETE', '/v1/me', { confirmForfeit }),
  activity: () => call<ActivityDTO>('GET', '/v1/activity'),
  transparency: () => call<TransparencyDTO>('GET', '/v1/transparency'),
  releaseReservation: (id: string) => call<{ released: boolean }>('POST', `/v1/reservations/${id}/release`, {}),
};

export const httpRewardsApi: RewardsApi = {
  program: () => call<ProgramInfo>('GET', '/v1/program'),
  offers: () => call<OfferDTO[]>('GET', '/v1/offers'),
  acceptOffer: (offerId, key) => call<ReservationDTO>('POST', `/v1/offers/${offerId}/accept`, {}, { 'idempotency-key': key }),
  submitSession: (evidence: SessionEvidence) => call<AwardDecision>('POST', '/v1/sessions', evidence),
  balances: () => call<BalancesDTO>('GET', '/v1/balances'),
  requestPayout: (amount, key) => call<PayoutDTO>('POST', '/v1/payouts', { amount }, { 'idempotency-key': key }),
};
