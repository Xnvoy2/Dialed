import { DayKey, addDays, daysBetween, weekDays } from './dates';

/**
 * Comparisons use only recorded local data. This week so far is compared with
 * last week up to the same weekday, never with a whole finished week.
 */
export function sumDays(byDay: Map<DayKey, number>, days: DayKey[]): number {
  return days.reduce((s, d) => s + (byDay.get(d) ?? 0), 0);
}

export interface WeekComparison {
  current: number;
  previousSamePoint: number;
  /** null when last week has nothing to compare against. */
  delta: number | null;
}

export function compareWeekSoFar(byDay: Map<DayKey, number>, weekStart: DayKey, today: DayKey): WeekComparison {
  const elapsed = Math.min(6, Math.max(0, daysBetween(weekStart, today)));
  const current = sumDays(byDay, weekDays(weekStart).slice(0, elapsed + 1));
  const prevStart = addDays(weekStart, -7);
  const previousSamePoint = sumDays(byDay, weekDays(prevStart).slice(0, elapsed + 1));
  return { current, previousSamePoint, delta: previousSamePoint > 0 ? current - previousSamePoint : null };
}

export function describeDelta(c: WeekComparison, unit: (seconds: number) => string): string {
  if (c.delta === null) {
    return c.current > 0 ? 'Nothing recorded by this point last week' : 'No focus recorded yet this week';
  }
  if (c.delta === 0) return 'Same as this point last week';
  return `${unit(Math.abs(c.delta))} ${c.delta > 0 ? 'more' : 'less'} than this point last week`;
}
