import { DayKey, addDays } from './dates';

/**
 * Focus streaks from days with at least one recorded focus minute.
 * Today without focus yet doesn't break a streak that ran through yesterday.
 */
export function focusStreak(days: ReadonlySet<DayKey>, today: DayKey): { current: number; best: number } {
  let current = 0;
  let d = days.has(today) ? today : addDays(today, -1);
  while (days.has(d)) {
    current++;
    d = addDays(d, -1);
  }
  let best = 0;
  let run = 0;
  let prev: DayKey | null = null;
  for (const day of [...days].sort()) {
    run = prev && addDays(prev, 1) === day ? run + 1 : 1;
    best = Math.max(best, run);
    prev = day;
  }
  return { current, best: Math.max(best, current) };
}
