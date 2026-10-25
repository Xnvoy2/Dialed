import { useCallback } from 'react';
import { projectedEndAt } from '../domain/focus';
import { blockingReadiness, willBlock } from '../domain/lockin';
import { blocking } from '../native/blocking';
import { cancelSessionEnd, scheduleSessionEnd } from '../native/notifications';
import {
  FocusSession,
  endSession,
  getSession,
  pauseSession,
  reconcileOpenSession,
  resumeSession,
  startSession,
} from '../repos/sessions';
import { useHaptics } from '../ui/haptics';
import { useApp } from './AppProvider';
import { applyShield, syncShieldActivity } from './shield';

/**
 * Coordinates a session's side effects: the database row is the source of
 * truth; the notification and the shield follow it.
 */
export function useFocusActions() {
  const { db, prefs, refresh } = useApp();
  const haptics = useHaptics();

  const liftEffects = useCallback(
    async (s: FocusSession | null) => {
      await cancelSessionEnd();
      if (s?.blockingRequested) {
        syncShieldActivity(db, s);
        try {
          await blocking.stopShield();
        } catch {
          // Recovery retries on foreground.
        }
      }
    },
    [db],
  );

  const start = useCallback(
    async (input: { kind: 'focus' | 'break'; minutes: number; taskId?: string | null; reason?: string | null }) => {
      const wantsBlocking =
        input.kind === 'focus' && willBlock(blockingReadiness(blocking.availability(), prefs.blockingEnabled));
      const s = startSession(db, {
        kind: input.kind,
        plannedSeconds: input.minutes * 60,
        taskId: input.taskId ?? null,
        blockingRequested: wantsBlocking,
        reason: input.kind === 'focus' ? input.reason ?? null : null,
      });
      haptics.impact();
      refresh();
      const endAt = projectedEndAt(s);
      if (endAt && prefs.notifyOnSessionEnd) await scheduleSessionEnd(endAt, s.kind);
      await applyShield(db, s, true);
      refresh();
      return getSession(db, s.id)!;
    },
    [db, prefs.blockingEnabled, prefs.notifyOnSessionEnd, haptics, refresh],
  );

  const pause = useCallback(
    async (id: string) => {
      pauseSession(db, id);
      haptics.select();
      const s = getSession(db, id);
      refresh();
      // Apps are unlocked during a pause; the user chose to step away.
      await liftEffects(s);
      refresh();
    },
    [db, haptics, liftEffects, refresh],
  );

  const resume = useCallback(
    async (id: string) => {
      resumeSession(db, id);
      haptics.select();
      const s = getSession(db, id);
      refresh();
      if (s) {
        const endAt = projectedEndAt(s);
        if (endAt && prefs.notifyOnSessionEnd) await scheduleSessionEnd(endAt, s.kind);
        await applyShield(db, s, false);
      }
      refresh();
    },
    [db, haptics, prefs.notifyOnSessionEnd, refresh],
  );

  const end = useCallback(
    async (id: string) => {
      syncShieldActivity(db, getSession(db, id));
      const s = endSession(db, id);
      haptics.impact();
      await liftEffects(s);
      refresh();
      return getSession(db, id);
    },
    [db, haptics, liftEffects, refresh],
  );

  /** Called by the on-screen timer when it reaches zero. */
  const reconcile = useCallback(async () => {
    const done = reconcileOpenSession(db);
    if (done) {
      haptics.success();
      await liftEffects(done);
      refresh();
    }
    return done ? getSession(db, done.id) : null;
  }, [db, haptics, liftEffects, refresh]);

  return { start, pause, resume, end, reconcile };
}
