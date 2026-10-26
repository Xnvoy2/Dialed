import * as SecureStore from 'expo-secure-store';
import { APP_VERSION } from '../config/app';
import { API_URL, ApiError, api, httpRewardsApi, newIdempotencyKey } from '../api/client';
import { formatUsdc, usdc } from '../domain/rewards';
import { AwardDecision, OfferDTO } from '../domain/rewardsApi';
import { Preferences } from '../repos/preferences';
import { FocusSession } from '../repos/sessions';

export const serverConfigured = () => API_URL !== null;

/** After Sign in with Apple: exchange Apple's identity token for a server session. */
export async function connectWithApple(identityToken: string | null, name: string | null) {
  if (!API_URL || !identityToken) return null;
  return api.signInWithApple(identityToken, name);
}

/** Development servers only. The simulator has no Apple Account. */
export async function connectDev() {
  if (!API_URL || !__DEV__) return null;
  const k = 'dialed.devDevice.v1';
  let id = await SecureStore.getItemAsync(k).catch(() => null);
  if (!id) {
    id = `sim-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    await SecureStore.setItemAsync(k, id);
  }
  return api.signInDev(id);
}

export async function acceptOffer(o: OfferDTO): Promise<Preferences['activeReservation']> {
  const r = await httpRewardsApi.acceptOffer(o.id, newIdempotencyKey());
  return {
    id: r.id,
    offerId: o.id,
    title: o.title,
    amount: o.amount,
    minActiveSeconds: o.minActiveSeconds,
    requiresBlocking: o.requiresBlocking,
    expiresAt: r.expiresAt,
    acceptedAt: Date.now(),
  };
}

/** True when a finished session should be sent for the accepted offer. */
export function shouldSubmit(s: FocusSession, r: Preferences['activeReservation']): boolean {
  if (!r || s.kind !== 'focus' || s.endedAt == null) return false;
  if (s.startedAt < r.acceptedAt - 60_000) return false;
  return (s.activeSeconds ?? 0) >= r.minActiveSeconds;
}

/**
 * Sends a finished lock-in's numbers (never its task or note) for the
 * accepted offer. The server decides; the app only reports what it saw.
 */
export async function submitLockIn(
  s: FocusSession,
  r: NonNullable<Preferences['activeReservation']>,
): Promise<{ decision: AwardDecision | null; message: string; clearReservation: boolean; network?: string | null }> {
  try {
    const d = await httpRewardsApi.submitSession({
      clientSessionId: s.id,
      reservationId: r.id,
      startedAt: new Date(s.startedAt).toISOString(),
      endedAt: new Date(s.endedAt!).toISOString(),
      plannedSeconds: s.plannedSeconds,
      activeSeconds: s.activeSeconds ?? 0,
      pauseCount: s.pauses.length,
      blockingApplied: s.blockingApplied,
      appVersion: APP_VERSION,
    });
    if (d.outcome === 'awarded') {
      const amt = formatUsdc(usdc(Number(d.amount)));
      const network = await httpRewardsApi
        .program()
        .then((p) => p.network as string)
        .catch(() => null);
      return {
        network,
        decision: d,
        message: d.state === 'available' ? `Earned ${amt}. Ready to pay out.` : `Earned ${amt}. Available after review.`,
        clearReservation: true,
      };
    }
    if (d.outcome === 'duplicate') return { decision: d, message: 'Already counted.', clearReservation: true };
    return { decision: d, message: d.reason, clearReservation: true };
  } catch (e) {
    const err = e as ApiError;
    // Offline: keep the reservation so it can be retried from Rewards.
    if (err.code === 'offline') return { decision: null, message: 'Couldn’t reach the rewards server. Retry from Rewards.', clearReservation: false };
    return { decision: null, message: err.message, clearReservation: err.status === 404 };
  }
}
