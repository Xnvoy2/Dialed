import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';
import { Db } from '../db/driver';
import { openExpoDb } from '../db/expoDriver';
import { migrate } from '../db/migrations';
import { DayKey, dayKeyFor } from '../domain/dates';
import { blocking } from '../native/blocking';
import { cancelSessionEnd } from '../native/notifications';
import { Preferences, readPreferences, writePreferences } from '../repos/preferences';
import { getOpenSession, reconcileOpenSession } from '../repos/sessions';

interface AppContextValue {
  db: Db;
  prefs: Preferences;
  /** Local calendar day, refreshed on foreground and at midnight / zone changes. */
  today: DayKey;
  version: number;
  refresh: () => void;
  setPrefs: (patch: Partial<Preferences>) => void;
  reduceMotion: boolean;
  /** Id of a session that finished while the app wasn't watching, for the completion step. */
  justCompletedId: string | null;
  clearJustCompleted: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

let sharedDb: Db | null = null;
function getDb(): Db {
  if (!sharedDb) {
    sharedDb = openExpoDb();
    migrate(sharedDb);
  }
  return sharedDb;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const db = getDb();
  const [version, setVersion] = useState(0);
  const [today, setToday] = useState(() => dayKeyFor());
  const [systemReduceMotion, setSystemReduceMotion] = useState(false);
  const [justCompletedId, setJustCompletedId] = useState<string | null>(null);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const prefs = useMemo(() => readPreferences(db), [db, version]);
  const recovering = useRef(false);

  const setPrefs = useCallback(
    (patch: Partial<Preferences>) => {
      writePreferences(db, patch);
      refresh();
    },
    [db, refresh],
  );

  /**
   * Launch / foreground recovery. Completes a session that ran out while we
   * were away, and lifts any shield left behind without an open session.
   */
  const recover = useCallback(async () => {
    if (recovering.current) return;
    recovering.current = true;
    try {
      setToday(dayKeyFor());
      const finished = reconcileOpenSession(db);
      if (finished) {
        await cancelSessionEnd();
        if (finished.kind === 'focus') setJustCompletedId(finished.id);
      }
      const open = getOpenSession(db);
      const diag = blocking.diagnostics();
      if (diag?.shielded && (!open || open.status !== 'running')) {
        await blocking.stopShield();
      }
      refresh();
    } finally {
      recovering.current = false;
    }
  }, [db, refresh]);

  useEffect(() => {
    recover();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') recover();
    });
    // Catch midnight and timezone changes while the app stays open.
    const timer = setInterval(() => {
      const k = dayKeyFor();
      setToday((prev) => (prev === k ? prev : k));
    }, 30_000);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, [recover]);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setSystemReduceMotion);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setSystemReduceMotion);
    return () => sub.remove();
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      db,
      prefs,
      today,
      version,
      refresh,
      setPrefs,
      reduceMotion: prefs.motion === 'reduce' || systemReduceMotion,
      justCompletedId,
      clearJustCompleted: () => setJustCompletedId(null),
    }),
    [db, prefs, today, version, refresh, setPrefs, systemReduceMotion, justCompletedId],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

/** Re-runs a read whenever data changes or the day rolls over. */
export function useQuery<T>(read: (db: Db, today: DayKey) => T, deps: unknown[] = []): T {
  const { db, version, today } = useApp();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => read(db, today), [db, version, today, ...deps]);
}

/** Ticks for redraws only. Elapsed time is always computed from timestamps. */
export function useNow(intervalMs = 1000, active = true): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs, active]);
  return now;
}
