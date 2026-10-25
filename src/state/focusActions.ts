import { useCallback } from 'react';
import { projectedEndAt } from '../domain/focus';
import { blocking } from '../native/blocking';
import { cancelSessionEnd, scheduleSessionEnd } from '../native/notifications';
import {
  FocusSession,
  endSession,
  getSession,
  pauseSession,
  reconcileOpenSession,
  resumeSession,
  setBlockingApplied,
  startSession,
} from '../repos/sessions';
import { useHaptics } from '../ui/haptics';
import { useApp } from './AppProvider';

/**
 * Coordinates a session's side effects: the database row is the source of
 * truth; the notification and the shield follow it.
 */
export function useFocusActions() {
  const { db, prefs, refresh } = useApp();
  const haptics = useHaptics();

  const applySideEffects = useCallback(
    async (s: FocusSession) => {
      const endAt = projectedEndAt(s);
      if (endAt && prefs.notifyOnSessionEnd) await scheduleSessionEnd(endAt, s.kind);
      if (s.kind === 'focus' && s.blockingRequested && endAt) {
        try {
          const r = await blocking.startShield(endAt);
          setBlockingApplied(db, s.id, r.applied);
        } catch {
          setBlockingApplied(db, s.id, false);
        }
      }
    },
    [db, prefs.notifyOnSessionEnd],
  );

  const liftEffects = useCallback(async (s: FocusSession | null) => {
    await cancelSessionEnd();
    if (s?.blockingRequested) {
      try {
        await blocking.stopShield();
      } catch {
        // Diagnostics will show if a shield remains; recovery retries on foreground.
      }
    }
  }, []);

  const start = useCallback(
    async (input: { kind: 'focus' | 'break'; minutes: number; taskId?: string | null }) => {
      const wantsBlocking =
        input.kind === 'focus' && prefs.blockingEnabled && blocking.availability().state === 'approved';
      const s = startSession(db, {
        kind: input.kind,
        plannedSeconds: input.minutes * 60,
        taskId: input.taskId ?? null,
        blockingRequested: wantsBlocking,
      });
      haptics.impact();
      refresh();
      await applySideEffects(s);
      refresh();
      return s;
    },
    [db, prefs.blockingEnabled, applySideEffects, haptics, refresh],
  );

  const pause = useCallback(
    async (id: string) => {
      pauseSession(db, id);
      haptics.select();
      const s = getSession(db, id);
      refresh();
      // Shields are lifted during a pause; the user chose to step away.
      await liftEffects(s);
      if (s?.blockingRequested) setBlockingApplied(db, id, false);
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
      if (s) await applySideEffects(s);
      refresh();
    },
    [db, haptics, applySideEffects, refresh],
  );

  const end = useCallback(
    async (id: string) => {
      const s = endSession(db, id);
      haptics.impact();
      refresh();
      await liftEffects(s);
      return s;
    },
    [db, haptics, liftEffects, refresh],
  );

  /** Called by the on-screen timer when it reaches zero. */
  const reconcile = useCallback(async () => {
    const done = reconcileOpenSession(db);
    if (done) {
      haptics.success();
      refresh();
      await liftEffects(done);
    }
    return done;
  }, [db, haptics, liftEffects, refresh]);

  return { start, pause, resume, end, reconcile };
}
