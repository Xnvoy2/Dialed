import { Db } from '../db/driver';
import { DayKey, newId } from '../domain/dates';
import { ALL_WEEKDAYS, Frequency, HabitHistory, HabitSchedule } from '../domain/habits';

export interface Habit extends HabitSchedule {
  id: string;
  name: string;
  sortOrder: number;
  archivedAt: number | null;
  createdAt: number;
}

interface Row {
  id: string;
  name: string;
  frequency: Frequency;
  weekdays_mask: number;
  weekly_target: number;
  start_day: string;
  sort_order: number;
  archived_at: number | null;
  created_at: number;
}

const toHabit = (r: Row): Habit => ({
  id: r.id,
  name: r.name,
  frequency: r.frequency,
  weekdaysMask: r.weekdays_mask,
  weeklyTarget: r.weekly_target,
  startDay: r.start_day,
  sortOrder: r.sort_order,
  archivedAt: r.archived_at,
  createdAt: r.created_at,
});

export interface HabitInput {
  name: string;
  frequency: Frequency;
  weekdaysMask?: number;
  weeklyTarget?: number;
}

function validate(input: HabitInput): { name: string; mask: number; target: number } {
  const name = input.name.replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!name) throw new Error('A habit needs a name.');
  const mask = input.frequency === 'weekdays' ? (input.weekdaysMask ?? ALL_WEEKDAYS) & ALL_WEEKDAYS : ALL_WEEKDAYS;
  if (mask === 0) throw new Error('Pick at least one day.');
  const target = input.frequency === 'weekly' ? Math.min(7, Math.max(1, Math.round(input.weeklyTarget ?? 1))) : 1;
  return { name, mask, target };
}

export function listHabits(db: Db, includeArchived = false): Habit[] {
  return db
    .all<Row>(
      `SELECT * FROM habits ${includeArchived ? '' : 'WHERE archived_at IS NULL'} ORDER BY sort_order, created_at`,
    )
    .map(toHabit);
}

export function getHabit(db: Db, id: string): Habit | null {
  const r = db.get<Row>('SELECT * FROM habits WHERE id = ?', [id]);
  return r ? toHabit(r) : null;
}

export function createHabit(db: Db, input: HabitInput, startDay: DayKey, now = Date.now()): Habit {
  const v = validate(input);
  const id = newId();
  const sort = (db.get<{ m: number | null }>('SELECT MAX(sort_order) AS m FROM habits')?.m ?? 0) + 1;
  db.run(
    `INSERT INTO habits (id, name, frequency, weekdays_mask, weekly_target, start_day, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, v.name, input.frequency, v.mask, v.target, startDay, sort, now, now],
  );
  return getHabit(db, id)!;
}

/** Editing a schedule keeps all check-ins; history is recomputed with the new rule. */
export function updateHabit(db: Db, id: string, input: HabitInput, now = Date.now()): void {
  const v = validate(input);
  db.run(
    'UPDATE habits SET name = ?, frequency = ?, weekdays_mask = ?, weekly_target = ?, updated_at = ? WHERE id = ?',
    [v.name, input.frequency, v.mask, v.target, now, id],
  );
}

export function archiveHabit(db: Db, id: string, archived: boolean, now = Date.now()): void {
  db.run('UPDATE habits SET archived_at = ?, updated_at = ? WHERE id = ?', [archived ? now : null, now, id]);
}

export function deleteHabit(db: Db, id: string): void {
  db.run('DELETE FROM habits WHERE id = ?', [id]);
}

export function checkIn(db: Db, habitId: string, day: DayKey, today: DayKey, now = Date.now()): void {
  if (day > today) throw new Error('You can’t check in for a future day.');
  db.transaction(() => {
    db.run('DELETE FROM habit_rest_days WHERE habit_id = ? AND day = ?', [habitId, day]);
    db.run('INSERT OR IGNORE INTO habit_checkins (id, habit_id, day, created_at) VALUES (?, ?, ?, ?)', [
      newId(),
      habitId,
      day,
      now,
    ]);
  });
}

export function undoCheckIn(db: Db, habitId: string, day: DayKey): void {
  db.run('DELETE FROM habit_checkins WHERE habit_id = ? AND day = ?', [habitId, day]);
}

/** Planned rest: the day stops being an opportunity. A check-in on that day wins over rest. */
export function setRestDay(db: Db, habitId: string, day: DayKey, rest: boolean, now = Date.now()): void {
  if (rest) {
    const done = db.get('SELECT 1 FROM habit_checkins WHERE habit_id = ? AND day = ?', [habitId, day]);
    if (done) throw new Error('Undo the check-in before marking a rest day.');
    db.run('INSERT OR IGNORE INTO habit_rest_days (habit_id, day, created_at) VALUES (?, ?, ?)', [habitId, day, now]);
  } else {
    db.run('DELETE FROM habit_rest_days WHERE habit_id = ? AND day = ?', [habitId, day]);
  }
}

export function habitHistory(db: Db, habitId: string): HabitHistory {
  return histories(db, [habitId]).get(habitId) ?? { checkins: new Set(), restDays: new Set() };
}

export function histories(db: Db, habitIds: string[]): Map<string, HabitHistory> {
  const map = new Map<string, { checkins: Set<DayKey>; restDays: Set<DayKey> }>();
  for (const id of habitIds) map.set(id, { checkins: new Set(), restDays: new Set() });
  if (habitIds.length === 0) return map;
  const qs = habitIds.map(() => '?').join(',');
  for (const r of db.all<{ habit_id: string; day: string }>(
    `SELECT habit_id, day FROM habit_checkins WHERE habit_id IN (${qs})`,
    habitIds,
  )) {
    map.get(r.habit_id)?.checkins.add(r.day);
  }
  for (const r of db.all<{ habit_id: string; day: string }>(
    `SELECT habit_id, day FROM habit_rest_days WHERE habit_id IN (${qs})`,
    habitIds,
  )) {
    map.get(r.habit_id)?.restDays.add(r.day);
  }
  return map;
}
