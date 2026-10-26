import { Db } from '../db/driver';
import { WeekStart } from '../domain/dates';

export type TextScale = 'default' | 'large' | 'larger';
export type MotionPref = 'system' | 'reduce';

export interface Preferences {
  onboarded: boolean;
  focusMinutes: number;
  breakMinutes: number;
  weekStart: WeekStart;
  /** User wants an alert when a session ends. Only acted on if the OS grants permission. */
  notifyOnSessionEnd: boolean;
  /** We have shown our in-context explanation and asked the OS once. */
  notificationsAsked: boolean;
  /** User wants selected apps shielded during focus. Requires Screen Time authorisation. */
  blockingEnabled: boolean;
  textScale: TextScale;
  motion: MotionPref;
  haptics: boolean;
  /** Development builds only. Ignored in production. */
  demoRewards: boolean;
  /** Sign in with Apple's stable user id. Stored on this phone only. */
  appleUserId: string | null;
  /** Name Apple shared on first sign-in, if any. */
  displayName: string | null;
  /** Arc set up by the questionnaire. */
  arcStart: string | null;
  arcDays: number;
  goals: string[];
  /** The user's "why": the default lock-in reason shown on the shield. */
  why: string | null;
  /** Always-on Screen Time adult-website filter. */
  adultFilter: boolean;
  /** Signed in to the rewards server (the token itself lives in the keychain). */
  serverUserId: string | null;
  /** An accepted reward offer, submitted with the next lock-in that meets it. */
  activeReservation: {
    id: string;
    offerId: string;
    title: string;
    amount: string;
    minActiveSeconds: number;
    requiresBlocking: boolean;
    expiresAt: string;
    acceptedAt: number;
  } | null;
  /** Result of the last submission, shown on the completion screen. */
  lastAward: { sessionId: string; outcome: string; message: string } | null;
}

export const DEFAULT_PREFERENCES: Preferences = {
  onboarded: false,
  focusMinutes: 25,
  breakMinutes: 5,
  weekStart: 1,
  notifyOnSessionEnd: false,
  notificationsAsked: false,
  blockingEnabled: false,
  textScale: 'default',
  motion: 'system',
  haptics: true,
  demoRewards: false,
  appleUserId: null,
  displayName: null,
  arcStart: null,
  arcDays: 90,
  goals: [],
  why: null,
  adultFilter: false,
  serverUserId: null,
  activeReservation: null,
  lastAward: null,
};

export function readPreferences(db: Db): Preferences {
  const rows = db.all<{ key: string; value: string }>('SELECT key, value FROM preferences');
  const out: Record<string, unknown> = { ...DEFAULT_PREFERENCES };
  for (const { key, value } of rows) {
    if (!(key in DEFAULT_PREFERENCES)) continue;
    try {
      out[key] = JSON.parse(value);
    } catch {
      // keep default on corrupt value
    }
  }
  return out as unknown as Preferences;
}

export function writePreferences(db: Db, patch: Partial<Preferences>): void {
  db.transaction(() => {
    for (const [key, value] of Object.entries(patch)) {
      if (!(key in DEFAULT_PREFERENCES) || value === undefined) continue;
      db.run(
        'INSERT INTO preferences (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        [key, JSON.stringify(value)],
      );
    }
  });
}
