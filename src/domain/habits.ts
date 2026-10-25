import {
  DayKey,
  WeekStart,
  addDays,
  dayRange,
  maxDay,
  startOfWeek,
  weekDays,
  weekdayOf,
} from './dates';

/**
 * Habit schedules and consistency.
 *
 * Rules, deliberately chosen:
 * - An "opportunity" is a scheduled day (daily / selected weekdays) on or after
 *   the habit's start day, up to today, that is not a planned rest day.
 * - Today is pending, not missed: it only enters the denominator once it is done.
 * - Weekly habits ("N times a week") are judged per week. Any day can count.
 *   The current week is pending until the target is met.
 * - Lifetime check-ins only ever grow. Missing a day lowers the recent rate and
 *   can end a streak; it never removes past progress.
 * - Check-ins are records of the user's own say-so. They are never reward events.
 */
export type Frequency = 'daily' | 'weekdays' | 'weekly';

export interface HabitSchedule {
  frequency: Frequency;
  /** Bit i set = weekday i scheduled (0 = Sunday). Used when frequency = 'weekdays'. */
  weekdaysMask: number;
  /** Times per week. Used when frequency = 'weekly'. */
  weeklyTarget: number;
  startDay: DayKey;
}

export interface HabitHistory {
  checkins: ReadonlySet<DayKey>;
  restDays: ReadonlySet<DayKey>;
}

export type DayStatus =
  | 'done'
  | 'missed'
  | 'rest'
  | 'pending'
  | 'future'
  | 'unscheduled'
  | 'before_start';

export const ALL_WEEKDAYS = 0b1111111;
export const WORKDAYS = 0b0111110;

export function maskHas(mask: number, weekday: number): boolean {
  return (mask & (1 << weekday)) !== 0;
}
export function toggleMask(mask: number, weekday: number): number {
  return mask ^ (1 << weekday);
}

export function isScheduledOn(h: HabitSchedule, day: DayKey): boolean {
  if (day < h.startDay) return false;
  switch (h.frequency) {
    case 'daily':
      return true;
    case 'weekdays':
      return maskHas(h.weekdaysMask, weekdayOf(day));
    case 'weekly':
      return true; // any day may count toward the weekly target
  }
}

/** Should this habit appear in Today's list for `day`? */
export function isDueOn(h: HabitSchedule, history: HabitHistory, day: DayKey, weekStart: WeekStart): boolean {
  if (!isScheduledOn(h, day)) return false;
  if (history.restDays.has(day)) return false;
  if (h.frequency === 'weekly') {
    // Keep showing it on the day it was done so the tick stays visible.
    if (history.checkins.has(day)) return true;
    return weeklyCount(history, startOfWeek(day, weekStart)) < h.weeklyTarget;
  }
  return true;
}

export function dayStatus(h: HabitSchedule, history: HabitHistory, day: DayKey, today: DayKey): DayStatus {
  if (day < h.startDay) return 'before_start';
  if (history.checkins.has(day)) return 'done';
  if (day > today) return 'future';
  if (h.frequency !== 'weekly' && !isScheduledOn(h, day)) return 'unscheduled';
  if (history.restDays.has(day)) return 'rest';
  if (h.frequency === 'weekly') return day === today ? 'pending' : 'unscheduled';
  return day === today ? 'pending' : 'missed';
}

export function weeklyCount(history: HabitHistory, weekStartKey: DayKey): number {
  return weekDays(weekStartKey).filter((d) => history.checkins.has(d)).length;
}

export interface WeekSummary {
  weekStart: DayKey;
  /** Opportunities that have resolved (done, or a past scheduled day). */
  opportunities: number;
  completed: number;
  /** For weekly habits: the target and whether it was met. */
  target?: number;
  met?: boolean;
  days: { day: DayKey; status: DayStatus }[];
}

export function summarizeWeek(
  h: HabitSchedule,
  history: HabitHistory,
  weekStartKey: DayKey,
  today: DayKey,
): WeekSummary {
  const days = weekDays(weekStartKey).map((day) => ({ day, status: dayStatus(h, history, day, today) }));
  if (h.frequency === 'weekly') {
    const weekEnd = addDays(weekStartKey, 6);
    const count = weeklyCount(history, weekStartKey);
    const met = count >= h.weeklyTarget;
    const started = weekEnd >= h.startDay;
    const resolved = started && (met || weekEnd < today);
    return {
      weekStart: weekStartKey,
      opportunities: resolved ? 1 : 0,
      completed: resolved && met ? 1 : 0,
      target: h.weeklyTarget,
      met,
      days,
    };
  }
  let opportunities = 0;
  let completed = 0;
  for (const { status } of days) {
    if (status === 'done') {
      opportunities++;
      completed++;
    } else if (status === 'missed') {
      opportunities++;
    }
  }
  return { weekStart: weekStartKey, opportunities, completed, days };
}

export interface Consistency {
  /** Completed / resolved opportunities across the window; null when there were none. */
  rate: number | null;
  completed: number;
  opportunities: number;
  /** Consecutive completed opportunities (days, or weeks for weekly habits). */
  streak: number;
  /** Every check-in ever recorded. Never reduced by missed days. */
  lifetime: number;
}

export function consistency(
  h: HabitSchedule,
  history: HabitHistory,
  today: DayKey,
  weekStart: WeekStart,
  windowWeeks = 4,
): Consistency {
  const lifetime = history.checkins.size;
  const thisWeek = startOfWeek(today, weekStart);
  let completed = 0;
  let opportunities = 0;
  for (let i = windowWeeks - 1; i >= 0; i--) {
    const ws = addDays(thisWeek, -7 * i);
    const s = summarizeWeek(h, history, ws, today);
    completed += s.completed;
    opportunities += s.opportunities;
  }
  return {
    rate: opportunities === 0 ? null : completed / opportunities,
    completed,
    opportunities,
    streak: streak(h, history, today, weekStart),
    lifetime,
  };
}

export function streak(h: HabitSchedule, history: HabitHistory, today: DayKey, weekStart: WeekStart): number {
  if (h.frequency === 'weekly') {
    let count = 0;
    let ws = startOfWeek(today, weekStart);
    // The current week only adds to the streak once met; it never breaks it.
    if (weeklyCount(history, ws) >= h.weeklyTarget) count++;
    ws = addDays(ws, -7);
    while (addDays(ws, 6) >= h.startDay) {
      if (weeklyCount(history, ws) >= h.weeklyTarget) count++;
      else break;
      ws = addDays(ws, -7);
    }
    return count;
  }
  let count = 0;
  for (let day = today; day >= h.startDay; day = addDays(day, -1)) {
    const st = dayStatus(h, history, day, today);
    if (st === 'done') count++;
    else if (st === 'missed') break;
    // pending, rest and unscheduled days neither add nor break.
  }
  return count;
}

/** Scheduled opportunities in [from, to] (inclusive) for display totals. */
export function scheduledDays(h: HabitSchedule, history: HabitHistory, from: DayKey, to: DayKey): DayKey[] {
  if (h.frequency === 'weekly') return [];
  return dayRange(maxDay(from, h.startDay), to).filter(
    (d) => isScheduledOn(h, d) && !history.restDays.has(d),
  );
}

export function describeSchedule(h: Pick<HabitSchedule, 'frequency' | 'weekdaysMask' | 'weeklyTarget'>): string {
  if (h.frequency === 'daily') return 'Every day';
  if (h.frequency === 'weekly') return h.weeklyTarget === 1 ? 'Once a week' : `${h.weeklyTarget} times a week`;
  if (h.weekdaysMask === WORKDAYS) return 'Weekdays';
  if (h.weekdaysMask === 0b1000001) return 'Weekends';
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const order = [1, 2, 3, 4, 5, 6, 0];
  return order.filter((d) => maskHas(h.weekdaysMask, d)).map((d) => names[d]).join(', ');
}
