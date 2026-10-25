import { Db } from '../db/driver';
import { ArcPlan, GoalId } from '../domain/arc';
import { DayKey } from '../domain/dates';
import { createHabit, listHabits } from './habits';
import { writePreferences } from './preferences';

/**
 * Applies the plan the user confirmed: creates the habits they kept (skipping
 * any they already have by name, so redoing the setup never duplicates) and
 * saves the arc settings. Blocking and the adult filter need Screen Time, so
 * the screen applies those after asking iOS.
 */
export function applyPlan(
  db: Db,
  plan: ArcPlan,
  opts: { keep: Set<string>; goals: GoalId[]; today: DayKey },
): { created: number } {
  let created = 0;
  db.transaction(() => {
    const existing = new Set(listHabits(db).map((h) => h.name.toLowerCase()));
    for (const h of plan.habits) {
      if (!opts.keep.has(h.key) || existing.has(h.name.toLowerCase())) continue;
      createHabit(db, { name: h.name, frequency: h.frequency, weekdaysMask: h.weekdaysMask, weeklyTarget: h.weeklyTarget }, opts.today);
      created++;
    }
    writePreferences(db, {
      arcStart: opts.today,
      arcDays: plan.lengthDays,
      goals: opts.goals,
      why: plan.why,
      focusMinutes: plan.focusMinutes,
      blockingEnabled: plan.blockDuringLockIn && opts.keep.has('block'),
      adultFilter: plan.adultFilter && opts.keep.has('adult'),
      onboarded: true,
    });
  });
  return { created };
}
