import { Db } from '../db/driver';
import { projectedEndAt } from '../domain/focus';
import { shieldReason } from '../domain/lockin';
import { blocking } from '../native/blocking';
import { FocusSession, recordShieldActivity, setBlockingApplied } from '../repos/sessions';

/** Copies the extensions' counters onto the session. Safe to call repeatedly. */
export function syncShieldActivity(db: Db, s: FocusSession | null): void {
  if (!s?.blockingRequested) return;
  const a = blocking.activity();
  if (a) recordShieldActivity(db, s.id, a);
}

/**
 * (Re)applies the shield for a running lock-in and records whether it held.
 * Only `applied: true` from the native layer counts as blocked.
 */
export async function applyShield(db: Db, s: FocusSession, resetCounts: boolean): Promise<void> {
  const endAt = projectedEndAt(s);
  if (s.kind !== 'focus' || !s.blockingRequested || !endAt) return;
  try {
    const r = await blocking.startShield(endAt, { reason: shieldReason(s.reason, s.taskTitle), resetCounts });
    setBlockingApplied(db, s.id, r.applied, r.reason ?? null);
  } catch (e) {
    setBlockingApplied(db, s.id, false, String(e));
  }
}

