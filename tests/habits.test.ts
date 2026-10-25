import { describe, expect, it } from 'vitest';
import { migrate } from '../src/db/migrations';
import { addDays, startOfWeek, weekdayOf } from '../src/domain/dates';
import {
  HabitSchedule,
  WORKDAYS,
  consistency,
  dayStatus,
  isDueOn,
  isScheduledOn,
  summarizeWeek,
} from '../src/domain/habits';
import { checkIn, createHabit, habitHistory, setRestDay, undoCheckIn, updateHabit } from '../src/repos/habits';
import { openNodeDb } from './nodeDb';

// 2026-10-19 is a Monday.
const MON = '2026-10-19';
const h = (over: Partial<HabitSchedule> = {}): HabitSchedule => ({
  frequency: 'daily',
  weekdaysMask: 127,
  weeklyTarget: 1,
  startDay: '2026-10-01',
  ...over,
});
const hist = (checkins: string[] = [], rest: string[] = []) => ({
  checkins: new Set(checkins),
  restDays: new Set(rest),
});

describe('dates', () => {
  it('computes weekdays and week starts', () => {
    expect(weekdayOf(MON)).toBe(1);
    expect(startOfWeek('2026-10-25', 1)).toBe(MON); // Sunday → previous Monday
    expect(startOfWeek('2026-10-25', 0)).toBe('2026-10-25'); // Sunday-start week
    expect(startOfWeek('2026-10-24', 0)).toBe('2026-10-18');
  });

  it('is unaffected by daylight saving transitions', () => {
    // EU clocks change 2026-10-25, US 2026-11-01. Day arithmetic must still step one day.
    expect(addDays('2026-10-24', 1)).toBe('2026-10-25');
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
    expect(addDays('2026-03-29', -1)).toBe('2026-03-28');
  });

  it('crosses year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(startOfWeek('2027-01-01', 1)).toBe('2026-12-28');
  });
});

describe('habit scheduling', () => {
  it('schedules selected weekdays only', () => {
    const weekdays = h({ frequency: 'weekdays', weekdaysMask: WORKDAYS });
    expect(isScheduledOn(weekdays, MON)).toBe(true);
    expect(isScheduledOn(weekdays, '2026-10-25')).toBe(false); // Sunday
  });

  it('does not schedule before the start day', () => {
    expect(isScheduledOn(h({ startDay: '2026-10-22' }), '2026-10-21')).toBe(false);
  });

  it('hides a weekly habit once the week target is met, but keeps it visible on the day it was done', () => {
    const weekly = h({ frequency: 'weekly', weeklyTarget: 2 });
    const history = hist(['2026-10-19', '2026-10-21']);
    expect(isDueOn(weekly, history, '2026-10-21', 1)).toBe(true);
    expect(isDueOn(weekly, history, '2026-10-22', 1)).toBe(false);
    expect(isDueOn(weekly, history, '2026-10-26', 1)).toBe(true); // new week
  });

  it('rest days remove the opportunity rather than counting as missed', () => {
    const daily = h();
    const history = hist(['2026-10-19', '2026-10-20'], ['2026-10-21']);
    const today = '2026-10-23';
    expect(dayStatus(daily, history, '2026-10-21', today)).toBe('rest');
    expect(dayStatus(daily, history, '2026-10-22', today)).toBe('missed');
    expect(dayStatus(daily, history, today, today)).toBe('pending');
    const week = summarizeWeek(daily, history, MON, today);
    expect(week.opportunities).toBe(3); // Mon, Tue done; Wed rest; Thu missed; Fri pending
    expect(week.completed).toBe(2);
  });

  it('today is pending, not missed', () => {
    const week = summarizeWeek(h(), hist(), MON, MON);
    expect(week.opportunities).toBe(0);
  });

  it('weekly targets are judged per week', () => {
    const weekly = h({ frequency: 'weekly', weeklyTarget: 3 });
    const lastWeek = summarizeWeek(weekly, hist(['2026-10-13', '2026-10-15']), '2026-10-12', '2026-10-23');
    expect(lastWeek).toMatchObject({ opportunities: 1, completed: 0, met: false });
    const thisWeekPending = summarizeWeek(weekly, hist(['2026-10-20']), MON, '2026-10-23');
    expect(thisWeekPending.opportunities).toBe(0);
  });

  it('missed days end a streak but never reduce lifetime progress', () => {
    const daily = h({ startDay: '2026-10-10' });
    const checkins = ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-15', '2026-10-16'];
    const before = consistency(daily, hist(checkins), '2026-10-16', 1);
    const later = consistency(daily, hist(checkins), '2026-10-23', 1); // a week of misses later
    expect(before.lifetime).toBe(6);
    expect(later.lifetime).toBe(6);
    expect(before.streak).toBe(2);
    expect(later.streak).toBe(0);
    expect(later.rate!).toBeLessThan(before.rate!);
  });

  it('streaks skip rest days and unscheduled days', () => {
    const weekdays = h({ frequency: 'weekdays', weekdaysMask: WORKDAYS, startDay: '2026-10-12' });
    // Fri 16 done, weekend unscheduled, Mon 19 rest, Tue 20 done
    const c = consistency(weekdays, hist(['2026-10-16', '2026-10-20'], ['2026-10-19']), '2026-10-20', 1);
    expect(c.streak).toBe(2);
  });
});

describe('habits (SQLite)', () => {
  it('check-in, undo, rest day and future guard', () => {
    const db = openNodeDb();
    migrate(db);
    const habit = createHabit(db, { name: 'Read', frequency: 'daily' }, '2026-10-20');
    checkIn(db, habit.id, '2026-10-20', '2026-10-21');
    checkIn(db, habit.id, '2026-10-20', '2026-10-21'); // idempotent
    expect(habitHistory(db, habit.id).checkins.size).toBe(1);
    undoCheckIn(db, habit.id, '2026-10-20');
    expect(habitHistory(db, habit.id).checkins.size).toBe(0);
    setRestDay(db, habit.id, '2026-10-21', true);
    expect(habitHistory(db, habit.id).restDays.has('2026-10-21')).toBe(true);
    checkIn(db, habit.id, '2026-10-21', '2026-10-21'); // check-in clears rest
    expect(habitHistory(db, habit.id).restDays.size).toBe(0);
    expect(() => checkIn(db, habit.id, '2026-10-22', '2026-10-21')).toThrow(/future/);
  });

  it('editing a schedule keeps check-ins', () => {
    const db = openNodeDb();
    migrate(db);
    const habit = createHabit(db, { name: 'Run', frequency: 'daily' }, '2026-10-01');
    checkIn(db, habit.id, '2026-10-02', '2026-10-05');
    updateHabit(db, habit.id, { name: 'Run', frequency: 'weekly', weeklyTarget: 3 });
    expect(habitHistory(db, habit.id).checkins.has('2026-10-02')).toBe(true);
  });
});
