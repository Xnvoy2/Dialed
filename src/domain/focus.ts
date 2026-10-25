/**
 * Focus session timing, derived only from persisted timestamps.
 *
 * Nothing here counts ticks. The UI re-renders on an interval purely to
 * redraw; the elapsed time always comes from (now - startedAt - paused time).
 * That is what makes a session survive backgrounding, a force-quit or a
 * reboot: on relaunch the same arithmetic gives the same answer.
 */
export type SessionKind = 'focus' | 'break';
export type SessionStatus = 'running' | 'paused' | 'completed' | 'ended_early';
export const OPEN_STATUSES: SessionStatus[] = ['running', 'paused'];

export interface Pause {
  pausedAt: number;
  resumedAt: number | null;
}

export interface SessionTiming {
  startedAt: number;
  plannedSeconds: number;
  status: SessionStatus;
  endedAt: number | null;
  pauses: Pause[];
}

export function isOpen(status: SessionStatus): boolean {
  return status === 'running' || status === 'paused';
}

/** Total paused milliseconds. An open pause counts up to `now` (or to the end). */
export function pausedMs(s: SessionTiming, now: number): number {
  const cap = s.endedAt ?? now;
  let total = 0;
  for (const p of s.pauses) {
    const end = Math.min(p.resumedAt ?? cap, cap);
    total += Math.max(0, end - p.pausedAt);
  }
  return total;
}

/** Milliseconds of focus actually spent, pause time excluded, never negative. */
export function activeMs(s: SessionTiming, now: number): number {
  const end = s.endedAt ?? now;
  const raw = end - s.startedAt - pausedMs(s, now);
  return Math.max(0, Math.min(raw, s.plannedSeconds * 1000));
}

export function remainingMs(s: SessionTiming, now: number): number {
  return Math.max(0, s.plannedSeconds * 1000 - activeMs(s, now));
}

/**
 * The instant a running session reaches its planned length, given the pauses
 * recorded so far. Null while paused (it cannot end while paused).
 */
export function projectedEndAt(s: SessionTiming): number | null {
  if (s.status !== 'running') return null;
  const closedPauses = s.pauses.reduce(
    (sum, p) => sum + (p.resumedAt == null ? 0 : Math.max(0, p.resumedAt - p.pausedAt)),
    0,
  );
  return s.startedAt + s.plannedSeconds * 1000 + closedPauses;
}

export type Reconciled =
  | { kind: 'unchanged' }
  | { kind: 'completed'; endedAt: number; activeSeconds: number };

/**
 * Called on launch, on foreground, and on each redraw. If a running session
 * passed its planned length while we were not watching, it is completed at
 * the moment it actually finished, not at the moment we noticed.
 */
export function reconcile(s: SessionTiming, now: number): Reconciled {
  if (s.status !== 'running') return { kind: 'unchanged' };
  const endAt = projectedEndAt(s)!;
  if (now < endAt) return { kind: 'unchanged' };
  return { kind: 'completed', endedAt: endAt, activeSeconds: s.plannedSeconds };
}

export function formatCountdown(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatMinutes(totalSeconds: number): string {
  const minutes = Math.round(totalSeconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export const FOCUS_PRESETS = [15, 25, 45, 60, 90];
export const BREAK_PRESETS = [5, 10, 15];
