import { describe, expect, it } from 'vitest';
import { MIGRATIONS, currentVersion, migrate } from '../src/db/migrations';
import {
  assertLive,
  clientEligibility,
  notLiveSnapshot,
  simulatedSnapshot,
  sumBalances,
  usdc,
} from '../src/domain/rewards';
import { deleteAll, exportAll } from '../src/repos/data';
import { checkIn, createHabit, habitHistory, listHabits } from '../src/repos/habits';
import { readPreferences, writePreferences } from '../src/repos/preferences';
import {
  createTask,
  moveTask,
  moveTasksToDay,
  setTaskCompleted,
  tasksForDay,
  unfinishedBefore,
} from '../src/repos/tasks';
import { openNodeDb } from './nodeDb';

const tmp = () => `/tmp/lockin-test-${Math.random().toString(36).slice(2)}.db`;

describe('persistence across relaunch', () => {
  it('tasks, habits, check-ins and preferences survive reopening the database', () => {
    const path = tmp();
    let db = openNodeDb(path);
    migrate(db);
    createTask(db, { title: 'Draft proposal', day: '2026-10-25', estimateMinutes: 45 });
    const habit = createHabit(db, { name: 'Stretch', frequency: 'daily' }, '2026-10-25');
    checkIn(db, habit.id, '2026-10-25', '2026-10-25');
    writePreferences(db, { focusMinutes: 50, weekStart: 0, onboarded: true });

    db = openNodeDb(path); // cold launch
    expect(migrate(db)).toBe(MIGRATIONS.at(-1)!.version);
    expect(tasksForDay(db, '2026-10-25').map((t) => [t.title, t.estimateMinutes])).toEqual([['Draft proposal', 45]]);
    expect(listHabits(db).map((x) => x.name)).toEqual(['Stretch']);
    expect(habitHistory(db, habit.id).checkins.has('2026-10-25')).toBe(true);
    expect(readPreferences(db)).toMatchObject({ focusMinutes: 50, weekStart: 0, onboarded: true });
  });

  it('migrations are idempotent', () => {
    const db = openNodeDb();
    migrate(db);
    migrate(db);
    expect(currentVersion(db)).toBe(MIGRATIONS.at(-1)!.version);
  });
});

describe('tasks', () => {
  it('reorders, completes and preserves unfinished tasks until moved explicitly', () => {
    const db = openNodeDb();
    migrate(db);
    const a = createTask(db, { title: 'A', day: '2026-10-24' });
    const b = createTask(db, { title: 'B', day: '2026-10-24' });
    const c = createTask(db, { title: 'C', day: '2026-10-24' });
    moveTask(db, c.id, -1);
    expect(tasksForDay(db, '2026-10-24').map((t) => t.title)).toEqual(['A', 'C', 'B']);
    setTaskCompleted(db, a.id, true);
    expect(tasksForDay(db, '2026-10-24').map((t) => t.title)).toEqual(['C', 'B', 'A']);

    // Next day: B and C are still on the 24th, not silently moved.
    expect(tasksForDay(db, '2026-10-25')).toHaveLength(0);
    expect(unfinishedBefore(db, '2026-10-25').map((t) => t.title).sort()).toEqual(['B', 'C']);
    moveTasksToDay(db, [b.id], '2026-10-25');
    expect(tasksForDay(db, '2026-10-25').map((t) => t.title)).toEqual(['B']);
    expect(unfinishedBefore(db, '2026-10-25').map((t) => t.title)).toEqual(['C']);
  });

  it('rejects empty titles', () => {
    const db = openNodeDb();
    migrate(db);
    expect(() => createTask(db, { title: '   ', day: '2026-10-25' })).toThrow();
  });
});

describe('rewards honesty', () => {
  it('manual check-ins and task ticks never generate money', () => {
    const db = openNodeDb();
    migrate(db);
    const habit = createHabit(db, { name: 'Meditate', frequency: 'daily' }, '2026-10-01');
    for (let d = 1; d <= 25; d++) checkIn(db, habit.id, `2026-10-${String(d).padStart(2, '0')}`, '2026-10-25');
    expect(clientEligibility({ kind: 'habit_checkin' }).eligible).toBe(false);
    expect(clientEligibility({ kind: 'task_completed' }).eligible).toBe(false);
    const snap = notLiveSnapshot();
    expect(snap.balances).toMatchObject({ pending: 0, available: 0, paid: 0 });
    // No rewards table exists locally at all.
    const tables = db.all<{ name: string }>(`SELECT name FROM sqlite_master WHERE type='table'`).map((t) => t.name);
    expect(tables.some((t) => /reward|balance|ledger/.test(t))).toBe(false);
  });

  it('production starts with no offers and zero balances; client never claims eligibility', () => {
    const snap = notLiveSnapshot();
    expect(snap.status).toBe('not_live');
    expect(snap.offers).toHaveLength(0);
    expect(clientEligibility({ kind: 'focus_session', activeSeconds: 3600, completed: true }).eligible).toBe(false);
  });

  it('demo rewards are unavailable unless explicitly allowed, and can never pass as real', () => {
    expect(simulatedSnapshot(false)).toBeNull();
    const demo = simulatedSnapshot(true)!;
    expect(demo.provenance).toBe('simulated');
    expect(demo.balances.provenance).toBe('simulated');
    expect(() => assertLive(demo.balances)).toThrow(/Simulated/);
    expect(() => sumBalances('live', demo.entries as never)).toThrow(/Refusing/);
  });

  it('amounts are integer base units', () => {
    expect(() => usdc(0.5)).toThrow();
    expect(() => usdc(-1)).toThrow();
    expect(usdc(1_000_000)).toBe(1_000_000);
  });
});

describe('export and delete', () => {
  it('exports everything and deletes everything', () => {
    const db = openNodeDb();
    migrate(db);
    createTask(db, { title: 'Private task', day: '2026-10-25' });
    writePreferences(db, { onboarded: true });
    const out = exportAll(db, 'Dialed');
    expect(out.data.tasks).toHaveLength(1);
    expect(JSON.stringify(out)).toContain('Private task');
    deleteAll(db);
    expect(tasksForDay(db, '2026-10-25')).toHaveLength(0);
    expect(readPreferences(db).onboarded).toBe(false);
  });
});

describe('future rewards API (shipping implementation)', () => {
  it('reports not live, no offers, zero balances, and refuses to accept or pay', async () => {
    const { notLiveRewardsApi: api } = await import('../src/domain/rewardsApi');
    expect(await api.program()).toEqual({ status: 'not_live', termsVersion: null });
    expect(await api.offers()).toEqual([]);
    expect(await api.balances()).toEqual({ pending: '0', available: '0', paid: '0' });
    await expect(api.acceptOffer('x', 'k')).rejects.toThrow(/not live/);
    await expect(api.requestPayout('1', 'k')).rejects.toThrow(/not live/);
  });
});
