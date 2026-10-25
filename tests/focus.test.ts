import { describe, expect, it } from 'vitest';
import { migrate } from '../src/db/migrations';
import { activeMs, projectedEndAt, reconcile, remainingMs } from '../src/domain/focus';
import {
  SessionConflictError,
  endSession,
  focusSecondsByDay,
  getOpenSession,
  getSession,
  pauseSession,
  reconcileOpenSession,
  resumeSession,
  startSession,
} from '../src/repos/sessions';
import { createTask, deleteTask } from '../src/repos/tasks';
import { openNodeDb } from './nodeDb';

const MIN = 60_000;
const T0 = Date.UTC(2026, 9, 25, 9, 0, 0);

function freshDb(path?: string) {
  const db = openNodeDb(path);
  migrate(db);
  return db;
}

describe('focus timing (pure)', () => {
  it('excludes pause time from active focus', () => {
    const s = {
      startedAt: T0,
      plannedSeconds: 25 * 60,
      status: 'running' as const,
      endedAt: null,
      pauses: [{ pausedAt: T0 + 5 * MIN, resumedAt: T0 + 15 * MIN }],
    };
    expect(activeMs(s, T0 + 20 * MIN)).toBe(10 * MIN);
    expect(remainingMs(s, T0 + 20 * MIN)).toBe(15 * MIN);
    expect(projectedEndAt(s)).toBe(T0 + 35 * MIN);
  });

  it('counts an open pause up to now', () => {
    const s = {
      startedAt: T0,
      plannedSeconds: 1500,
      status: 'paused' as const,
      endedAt: null,
      pauses: [{ pausedAt: T0 + 5 * MIN, resumedAt: null }],
    };
    expect(activeMs(s, T0 + 60 * MIN)).toBe(5 * MIN);
    expect(reconcile(s, T0 + 999 * MIN)).toEqual({ kind: 'unchanged' });
  });

  it('never reports negative time if the clock moves backwards', () => {
    const s = { startedAt: T0, plannedSeconds: 600, status: 'running' as const, endedAt: null, pauses: [] };
    expect(activeMs(s, T0 - 10 * MIN)).toBe(0);
  });
});

describe('focus sessions (SQLite)', () => {
  it('prevents overlapping sessions', () => {
    const db = freshDb();
    startSession(db, { kind: 'focus', plannedSeconds: 1500 }, T0);
    expect(() => startSession(db, { kind: 'focus', plannedSeconds: 600 }, T0 + MIN)).toThrow(SessionConflictError);
    expect(() => startSession(db, { kind: 'break', plannedSeconds: 300 }, T0 + MIN)).toThrow(SessionConflictError);
  });

  it('enforces one open session at the storage layer too', () => {
    const db = freshDb();
    startSession(db, { kind: 'focus', plannedSeconds: 1500 }, T0);
    expect(() =>
      db.run(
        `INSERT INTO focus_sessions (id, kind, planned_seconds, status, started_at, local_day, time_zone, utc_offset_minutes, open_slot)
         VALUES ('x', 'focus', 60, 'running', 0, '2026-10-25', 'UTC', 0, 1)`,
      ),
    ).toThrow(/UNIQUE/);
  });

  it('allows a new session once the previous one ends', () => {
    const db = freshDb();
    const a = startSession(db, { kind: 'focus', plannedSeconds: 1500 }, T0);
    endSession(db, a.id, T0 + 10 * MIN);
    expect(() => startSession(db, { kind: 'break', plannedSeconds: 300 }, T0 + 10 * MIN)).not.toThrow();
  });

  it('records pauses and excludes them from active seconds when ended early', () => {
    const db = freshDb();
    const s = startSession(db, { kind: 'focus', plannedSeconds: 25 * 60 }, T0);
    pauseSession(db, s.id, T0 + 5 * MIN);
    resumeSession(db, s.id, T0 + 12 * MIN);
    pauseSession(db, s.id, T0 + 15 * MIN);
    const ended = endSession(db, s.id, T0 + 40 * MIN)!;
    expect(ended.status).toBe('ended_early');
    expect(ended.activeSeconds).toBe(8 * 60); // 5 + 3 minutes
    expect(ended.pauses).toHaveLength(2);
    expect(ended.pauses.every((p) => p.resumedAt !== null)).toBe(true);
    expect(getOpenSession(db)).toBeNull();
  });

  it('recovers after a force-quit: completes at the true end time, not when noticed', () => {
    const path = `/tmp/lockin-test-${Math.random().toString(36).slice(2)}.db`;
    let db = freshDb(path);
    const s = startSession(db, { kind: 'focus', plannedSeconds: 25 * 60 }, T0);
    pauseSession(db, s.id, T0 + 10 * MIN);
    resumeSession(db, s.id, T0 + 13 * MIN);
    // App killed. Re-open the same file as a cold launch would.
    db = freshDb(path);
    const open = getOpenSession(db)!;
    expect(open.status).toBe('running');
    // 20 min elapsed − 3 min paused = 17 active → 8 min left.
    expect(Math.round(remainingMs(open, T0 + 20 * MIN) / 1000)).toBe(8 * 60);
    // Relaunch two hours later.
    const done = reconcileOpenSession(db, T0 + 120 * MIN)!;
    expect(done.status).toBe('completed');
    expect(done.endedAt).toBe(T0 + 28 * MIN);
    expect(done.activeSeconds).toBe(25 * 60);
    expect(getOpenSession(db)).toBeNull();
  });

  it('keeps a paused session paused across relaunch, however long', () => {
    const db = freshDb();
    const s = startSession(db, { kind: 'focus', plannedSeconds: 600 }, T0);
    pauseSession(db, s.id, T0 + 2 * MIN);
    expect(reconcileOpenSession(db, T0 + 24 * 60 * MIN)).toBeNull();
    const open = getSession(db, s.id)!;
    expect(open.status).toBe('paused');
    expect(activeMs(open, T0 + 24 * 60 * MIN)).toBe(2 * MIN);
  });

  it('ending after the time was already up records completion, not early end', () => {
    const db = freshDb();
    const s = startSession(db, { kind: 'focus', plannedSeconds: 600 }, T0);
    const ended = endSession(db, s.id, T0 + 30 * MIN)!;
    expect(ended.status).toBe('completed');
    expect(ended.endedAt).toBe(T0 + 10 * MIN);
  });

  it('keeps the task title on the session after the task is deleted', () => {
    const db = freshDb();
    const task = createTask(db, { title: 'Write report', day: '2026-10-25' }, T0);
    const s = startSession(db, { kind: 'focus', plannedSeconds: 600, taskId: task.id }, T0);
    endSession(db, s.id, T0 + 5 * MIN);
    deleteTask(db, task.id);
    const after = getSession(db, s.id)!;
    expect(after.taskId).toBeNull();
    expect(after.taskTitle).toBe('Write report');
  });

  it('daily totals count only focus, never breaks or open sessions', () => {
    const db = freshDb();
    const a = startSession(db, { kind: 'focus', plannedSeconds: 600 }, T0);
    reconcileOpenSession(db, T0 + 11 * MIN);
    const b = startSession(db, { kind: 'break', plannedSeconds: 300 }, T0 + 11 * MIN);
    endSession(db, b.id, T0 + 16 * MIN);
    startSession(db, { kind: 'focus', plannedSeconds: 600 }, T0 + 16 * MIN);
    const day = getSession(db, a.id)!.localDay;
    expect(focusSecondsByDay(db, day, day).get(day)).toBe(600);
  });
});
