import { Db } from '../db/driver';
import { DayKey, currentTimeZone, dayKeyFor, newId, utcOffsetMinutes } from '../domain/dates';
import {
  Pause,
  SessionKind,
  SessionStatus,
  SessionTiming,
  activeMs,
  reconcile,
} from '../domain/focus';

export interface FocusSession extends SessionTiming {
  id: string;
  kind: SessionKind;
  taskId: string | null;
  taskTitle: string | null;
  activeSeconds: number | null;
  localDay: DayKey;
  timeZone: string;
  note: string | null;
  blockingRequested: boolean;
  blockingApplied: boolean;
  /** Why the user is locking in. Shown on the shield; private, never uploaded. */
  reason: string | null;
  /** Why blocking could not be applied, when it was requested. */
  blockingError: string | null;
  /** Times the user tapped "Back to focus" on the shield. */
  backToFocusCount: number;
  /** Times the user chose "Open for 5 minutes" on the shield. */
  deliberateExitCount: number;
}

interface Row {
  id: string;
  kind: SessionKind;
  task_id: string | null;
  task_title_snapshot: string | null;
  planned_seconds: number;
  status: SessionStatus;
  started_at: number;
  ended_at: number | null;
  active_seconds: number | null;
  local_day: string;
  time_zone: string;
  note: string | null;
  blocking_requested: number;
  blocking_applied: number;
  reason: string | null;
  blocking_error: string | null;
  back_to_focus_count: number;
  deliberate_exit_count: number;
  current_title: string | null;
}

export class SessionConflictError extends Error {
  constructor() {
    super('A focus session is already in progress.');
    this.name = 'SessionConflictError';
  }
}

const SELECT = `SELECT s.*, t.title AS current_title FROM focus_sessions s LEFT JOIN tasks t ON t.id = s.task_id`;

function pausesFor(db: Db, ids: string[]): Map<string, Pause[]> {
  const map = new Map<string, Pause[]>();
  if (ids.length === 0) return map;
  const rows = db.all<{ session_id: string; paused_at: number; resumed_at: number | null }>(
    `SELECT session_id, paused_at, resumed_at FROM session_pauses
     WHERE session_id IN (${ids.map(() => '?').join(',')}) ORDER BY paused_at`,
    ids,
  );
  for (const r of rows) {
    const list = map.get(r.session_id) ?? [];
    list.push({ pausedAt: r.paused_at, resumedAt: r.resumed_at });
    map.set(r.session_id, list);
  }
  return map;
}

function hydrate(db: Db, rows: Row[]): FocusSession[] {
  const pauses = pausesFor(db, rows.map((r) => r.id));
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    taskId: r.task_id,
    taskTitle: r.current_title ?? r.task_title_snapshot,
    plannedSeconds: r.planned_seconds,
    status: r.status,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    activeSeconds: r.active_seconds,
    localDay: r.local_day,
    timeZone: r.time_zone,
    note: r.note,
    blockingRequested: r.blocking_requested === 1,
    blockingApplied: r.blocking_applied === 1,
    reason: r.reason,
    blockingError: r.blocking_error,
    backToFocusCount: r.back_to_focus_count ?? 0,
    deliberateExitCount: r.deliberate_exit_count ?? 0,
    pauses: pauses.get(r.id) ?? [],
  }));
}

export function getSession(db: Db, id: string): FocusSession | null {
  const r = db.get<Row>(`${SELECT} WHERE s.id = ?`, [id]);
  return r ? hydrate(db, [r])[0] : null;
}

export function getOpenSession(db: Db): FocusSession | null {
  const r = db.get<Row>(`${SELECT} WHERE s.open_slot = 1`);
  return r ? hydrate(db, [r])[0] : null;
}

export function startSession(
  db: Db,
  input: {
    kind: SessionKind;
    plannedSeconds: number;
    taskId?: string | null;
    blockingRequested?: boolean;
    reason?: string | null;
  },
  now = Date.now(),
): FocusSession {
  const planned = Math.round(input.plannedSeconds);
  if (!(planned > 0)) throw new Error('Session length must be positive.');
  return db.transaction(() => {
    if (getOpenSession(db)) throw new SessionConflictError();
    const id = newId();
    const taskTitle = input.taskId
      ? db.get<{ title: string }>('SELECT title FROM tasks WHERE id = ?', [input.taskId])?.title ?? null
      : null;
    try {
      db.run(
        `INSERT INTO focus_sessions
          (id, kind, task_id, task_title_snapshot, planned_seconds, status, started_at, local_day,
           time_zone, utc_offset_minutes, blocking_requested, reason, open_slot)
         VALUES (?, ?, ?, ?, ?, 'running', ?, ?, ?, ?, ?, ?, 1)`,
        [
          id,
          input.kind,
          taskTitle ? input.taskId! : null,
          taskTitle,
          planned,
          now,
          dayKeyFor(new Date(now)),
          currentTimeZone(),
          utcOffsetMinutes(new Date(now)),
          input.blockingRequested ? 1 : 0,
          cleanReason(input.reason),
        ],
      );
    } catch (e) {
      if (String(e).includes('UNIQUE')) throw new SessionConflictError();
      throw e;
    }
    return getSession(db, id)!;
  });
}

export function pauseSession(db: Db, id: string, now = Date.now()): void {
  db.transaction(() => {
    const s = getSession(db, id);
    if (!s || s.status !== 'running') return;
    if (reconcileSession(db, s, now)) return; // it had already finished
    db.run('INSERT INTO session_pauses (session_id, paused_at) VALUES (?, ?)', [id, now]);
    db.run(`UPDATE focus_sessions SET status = 'paused' WHERE id = ?`, [id]);
  });
}

export function resumeSession(db: Db, id: string, now = Date.now()): void {
  db.transaction(() => {
    const s = getSession(db, id);
    if (!s || s.status !== 'paused') return;
    db.run('UPDATE session_pauses SET resumed_at = ? WHERE session_id = ? AND resumed_at IS NULL', [now, id]);
    db.run(`UPDATE focus_sessions SET status = 'running' WHERE id = ?`, [id]);
  });
}

/** End by the user's choice. If the time was already up, it is recorded as completed. */
export function endSession(db: Db, id: string, now = Date.now()): FocusSession | null {
  db.transaction(() => {
    const s = getSession(db, id);
    if (!s || (s.status !== 'running' && s.status !== 'paused')) return;
    if (reconcileSession(db, s, now)) return;
    const active = Math.floor(activeMs(s, now) / 1000);
    db.run('UPDATE session_pauses SET resumed_at = ? WHERE session_id = ? AND resumed_at IS NULL', [now, id]);
    db.run(
      `UPDATE focus_sessions SET status = 'ended_early', ended_at = ?, active_seconds = ?, open_slot = NULL WHERE id = ?`,
      [now, active, id],
    );
  });
  return getSession(db, id);
}

function reconcileSession(db: Db, s: FocusSession, now: number): boolean {
  const r = reconcile(s, now);
  if (r.kind !== 'completed') return false;
  db.run(
    `UPDATE focus_sessions SET status = 'completed', ended_at = ?, active_seconds = ?, open_slot = NULL WHERE id = ?`,
    [r.endedAt, r.activeSeconds, s.id],
  );
  return true;
}

/**
 * Run on launch, on foreground and while the timer is on screen. Returns the
 * session that just completed, if any, so the UI can show the completion step.
 */
export function reconcileOpenSession(db: Db, now = Date.now()): FocusSession | null {
  return db.transaction(() => {
    const s = getOpenSession(db);
    if (!s) return null;
    return reconcileSession(db, s, now) ? getSession(db, s.id) : null;
  });
}

export function setSessionNote(db: Db, id: string, note: string): void {
  db.run('UPDATE focus_sessions SET note = ? WHERE id = ?', [note.trim() || null, id]);
}

export function cleanReason(reason: string | null | undefined): string | null {
  const r = (reason ?? '').replace(/\s+/g, ' ').trim();
  return r ? r.slice(0, 140) : null;
}

export function setBlockingApplied(db: Db, id: string, applied: boolean, error: string | null = null): void {
  db.run('UPDATE focus_sessions SET blocking_applied = ?, blocking_error = ? WHERE id = ?', [
    applied ? 1 : 0,
    applied ? null : error,
    id,
  ]);
}

/** Shield activity reported by the extensions. Counts only; they only ever grow. */
export function recordShieldActivity(db: Db, id: string, counts: { backToFocus: number; deliberateExits: number }): void {
  db.run(
    `UPDATE focus_sessions SET
       back_to_focus_count = MAX(back_to_focus_count, ?),
       deliberate_exit_count = MAX(deliberate_exit_count, ?)
     WHERE id = ?`,
    [Math.max(0, Math.floor(counts.backToFocus)), Math.max(0, Math.floor(counts.deliberateExits)), id],
  );
}

/** Finished sessions whose local day falls in [from, to]. */
export function finishedSessions(db: Db, from: DayKey, to: DayKey, kind: SessionKind | null = 'focus'): FocusSession[] {
  const rows = db.all<Row>(
    `${SELECT} WHERE s.open_slot IS NULL AND s.local_day BETWEEN ? AND ? ${kind ? 'AND s.kind = ?' : ''}
     ORDER BY s.started_at DESC`,
    kind ? [from, to, kind] : [from, to],
  );
  return hydrate(db, rows);
}

export function recentSessions(db: Db, limit = 50): FocusSession[] {
  const rows = db.all<Row>(
    `${SELECT} WHERE s.open_slot IS NULL AND s.kind = 'focus' ORDER BY s.started_at DESC LIMIT ?`,
    [limit],
  );
  return hydrate(db, rows);
}

/** Seconds of finished focus per local day. */
export function focusSecondsByDay(db: Db, from: DayKey, to: DayKey): Map<DayKey, number> {
  const rows = db.all<{ local_day: string; total: number }>(
    `SELECT local_day, SUM(active_seconds) AS total FROM focus_sessions
     WHERE kind = 'focus' AND open_slot IS NULL AND local_day BETWEEN ? AND ?
     GROUP BY local_day`,
    [from, to],
  );
  return new Map(rows.map((r) => [r.local_day, r.total ?? 0]));
}

export function focusSecondsForTask(db: Db, taskId: string): number {
  return (
    db.get<{ total: number | null }>(
      `SELECT SUM(active_seconds) AS total FROM focus_sessions WHERE kind = 'focus' AND task_id = ? AND open_slot IS NULL`,
      [taskId],
    )?.total ?? 0
  );
}

/** Local days with at least a minute of finished focus. */
export function focusDays(db: Db): Set<DayKey> {
  const rows = db.all<{ local_day: string }>(
    `SELECT local_day FROM focus_sessions
     WHERE kind = 'focus' AND open_slot IS NULL
     GROUP BY local_day HAVING SUM(active_seconds) >= 60`,
  );
  return new Set(rows.map((r) => r.local_day));
}

export function focusTotals(db: Db): { seconds: number; sessions: number; firstDay: DayKey | null } {
  const r = db.get<{ s: number | null; n: number; f: string | null }>(
    `SELECT SUM(active_seconds) AS s, COUNT(*) AS n, MIN(local_day) AS f FROM focus_sessions
     WHERE kind = 'focus' AND open_slot IS NULL`,
  );
  return { seconds: r?.s ?? 0, sessions: r?.n ?? 0, firstDay: r?.f ?? null };
}
