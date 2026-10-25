import { describe, expect, it } from 'vitest';
import { DEFAULT_ANSWERS, arcProgress, buildPlan } from '../src/domain/arc';

describe('arc plan', () => {
  it('quitting porn and vaping sets up check-ins, the adult filter and blocking', () => {
    const p = buildPlan({ ...DEFAULT_ANSWERS, quit: ['porn', 'nicotine'], why: '  be someone my family is proud of ' });
    expect(p.habits.map((h) => h.name)).toEqual(['Porn-free today', 'Nicotine-free today']);
    expect(p.adultFilter).toBe(true);
    expect(p.blockDuringLockIn).toBe(true);
    expect(p.why).toBe('be someone my family is proud of');
  });

  it('gym uses the chosen days per week, clamped', () => {
    expect(buildPlan({ ...DEFAULT_ANSWERS, build: ['gym'], gymDays: 5 }).habits[0]).toMatchObject({
      name: 'Workout',
      frequency: 'weekly',
      weeklyTarget: 5,
    });
    expect(buildPlan({ ...DEFAULT_ANSWERS, build: ['gym'], gymDays: 12 }).habits[0].weeklyTarget).toBe(7);
  });

  it('sleep uses the chosen bedtime', () => {
    expect(buildPlan({ ...DEFAULT_ANSWERS, build: ['sleep'], bedtime: '22:30' }).habits[0].name).toBe('In bed by 22:30');
  });

  it('no adult filter or blocking unless the answers call for it', () => {
    const p = buildPlan({ ...DEFAULT_ANSWERS, build: ['reading'] });
    expect(p.adultFilter).toBe(false);
    expect(p.blockDuringLockIn).toBe(false);
    expect(p.why).toBeNull();
  });

  it('picking distractions turns on lock-in blocking', () => {
    expect(buildPlan({ ...DEFAULT_ANSWERS, distractions: ['short_video'] }).blockDuringLockIn).toBe(true);
  });

  it('study or a project raises very short focus lengths to 25 minutes', () => {
    expect(buildPlan({ ...DEFAULT_ANSWERS, build: ['study'], focusMinutes: 15 }).focusMinutes).toBe(25);
    expect(buildPlan({ ...DEFAULT_ANSWERS, build: ['reading'], focusMinutes: 15 }).focusMinutes).toBe(15);
  });

  it('never creates duplicate habits', () => {
    const p = buildPlan({ ...DEFAULT_ANSWERS, quit: ['porn', 'porn'] as never, build: ['gym', 'gym'] as never });
    expect(p.habits).toHaveLength(2);
  });
});

describe('arc progress', () => {
  it('counts day 1 on the start day and finishes on the last day', () => {
    expect(arcProgress('2026-10-25', 90, '2026-10-25')).toMatchObject({ day: 1, daysLeft: 89, done: false, endDay: '2027-01-22' });
    expect(arcProgress('2026-10-25', 30, '2026-11-23')).toMatchObject({ day: 30, daysLeft: 0, done: false });
    expect(arcProgress('2026-10-25', 30, '2026-12-01')).toMatchObject({ day: 30, daysLeft: 0, done: true });
  });
});

describe('applying a plan (SQLite)', async () => {
  const { migrate } = await import('../src/db/migrations');
  const { applyPlan } = await import('../src/repos/arc');
  const { listHabits } = await import('../src/repos/habits');
  const { readPreferences } = await import('../src/repos/preferences');
  const { openNodeDb } = await import('./nodeDb');

  it('creates only the kept habits, saves the arc, and never duplicates on redo', () => {
    const db = openNodeDb();
    migrate(db);
    const plan = buildPlan({ ...DEFAULT_ANSWERS, quit: ['porn', 'nicotine'], build: ['gym'], why: 'my future' });
    const keep = new Set(['porn', 'gym', 'block', 'adult']);
    expect(applyPlan(db, plan, { keep, goals: ['porn', 'nicotine', 'gym'], today: '2026-10-25' }).created).toBe(2);
    expect(listHabits(db).map((h) => h.name).sort()).toEqual(['Porn-free today', 'Workout']);
    expect(readPreferences(db)).toMatchObject({
      arcStart: '2026-10-25',
      arcDays: 90,
      why: 'my future',
      adultFilter: true,
      blockingEnabled: true,
      onboarded: true,
    });
    expect(applyPlan(db, plan, { keep, goals: [], today: '2026-10-26' }).created).toBe(0);
    expect(listHabits(db)).toHaveLength(2);
  });

  it('unticking the filter keeps it off', () => {
    const db = openNodeDb();
    migrate(db);
    applyPlan(db, buildPlan({ ...DEFAULT_ANSWERS, quit: ['porn'] }), { keep: new Set(['porn']), goals: ['porn'], today: '2026-10-25' });
    expect(readPreferences(db).adultFilter).toBe(false);
    expect(readPreferences(db).blockingEnabled).toBe(false);
  });
});
