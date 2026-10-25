import { describe, expect, it } from 'vitest';
import { migrate } from '../src/db/migrations';
import { compareWeekSoFar } from '../src/domain/progress';
import { endSession, focusSecondsByDay, startSession } from '../src/repos/sessions';
import { openNodeDb } from './nodeDb';

describe('weekly comparison', () => {
  const byDay = new Map([
    ['2026-10-12', 1800], // last Mon
    ['2026-10-13', 600], // last Tue
    ['2026-10-16', 3600], // last Fri (after the comparison point)
    ['2026-10-19', 1200], // this Mon
    ['2026-10-20', 1500], // this Tue
  ]);

  it('compares this week so far with last week up to the same weekday', () => {
    const c = compareWeekSoFar(byDay, '2026-10-19', '2026-10-20');
    expect(c.current).toBe(2700);
    expect(c.previousSamePoint).toBe(2400); // Friday excluded
    expect(c.delta).toBe(300);
  });

  it('has no delta when last week is empty, rather than inventing one', () => {
    const c = compareWeekSoFar(new Map([['2026-10-19', 600]]), '2026-10-19', '2026-10-19');
    expect(c.delta).toBeNull();
  });

  it('respects a Sunday week start', () => {
    const c = compareWeekSoFar(byDay, '2026-10-18', '2026-10-19');
    expect(c.current).toBe(1200);
    expect(c.previousSamePoint).toBe(1800); // Sun 11 + Mon 12
  });
});

describe('time zone handling', () => {
  it('a session keeps the local day it started on, even after the zone changes', () => {
    const db = openNodeDb();
    migrate(db);
    const prevTz = process.env.TZ;
    // Started 23:30 in New York on 24 Oct (= 03:30 UTC on 25 Oct).
    process.env.TZ = 'America/New_York';
    const start = Date.UTC(2026, 9, 25, 3, 30);
    const s = startSession(db, { kind: 'focus', plannedSeconds: 1800 }, start);
    endSession(db, s.id, start + 20 * 60_000);
    // User flies to London; the session must still count for the 24th.
    process.env.TZ = 'Europe/London';
    expect(focusSecondsByDay(db, '2026-10-24', '2026-10-24').get('2026-10-24')).toBe(1200);
    expect(focusSecondsByDay(db, '2026-10-25', '2026-10-25').size).toBe(0);
    process.env.TZ = prevTz;
  });
});

describe('focus streaks', async () => {
  const { focusStreak } = await import('../src/domain/streaks');
  it('counts through yesterday when today has no focus yet', () => {
    const days = new Set(['2026-10-22', '2026-10-23', '2026-10-24']);
    expect(focusStreak(days, '2026-10-25')).toEqual({ current: 3, best: 3 });
  });
  it('breaks after a missed day but keeps the best', () => {
    const days = new Set(['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-24', '2026-10-25']);
    expect(focusStreak(days, '2026-10-25')).toEqual({ current: 2, best: 4 });
    expect(focusStreak(days, '2026-10-27')).toEqual({ current: 0, best: 4 });
  });
  it('is zero with no data', () => {
    expect(focusStreak(new Set(), '2026-10-25')).toEqual({ current: 0, best: 0 });
  });
});

describe('focus days (SQLite)', () => {
  it('needs at least a minute and ignores breaks and open sessions', async () => {
    const { focusDays } = await import('../src/repos/sessions');
    const db = openNodeDb();
    migrate(db);
    const T = Date.UTC(2026, 9, 25, 10);
    const a = startSession(db, { kind: 'focus', plannedSeconds: 600 }, T);
    endSession(db, a.id, T + 30_000); // 30 s
    const b = startSession(db, { kind: 'break', plannedSeconds: 600 }, T + 60_000);
    endSession(db, b.id, T + 400_000);
    expect(focusDays(db).size).toBe(0);
    const c = startSession(db, { kind: 'focus', plannedSeconds: 600 }, T + 500_000);
    endSession(db, c.id, T + 600_000);
    expect(focusDays(db).size).toBe(1);
  });
});
