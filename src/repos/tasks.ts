import { Db } from '../db/driver';
import { DayKey, newId } from '../domain/dates';

export interface Task {
  id: string;
  title: string;
  notes: string | null;
  estimateMinutes: number | null;
  day: DayKey;
  sortOrder: number;
  completedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

interface Row {
  id: string;
  title: string;
  notes: string | null;
  estimate_minutes: number | null;
  day: string;
  sort_order: number;
  completed_at: number | null;
  created_at: number;
  updated_at: number;
}

const toTask = (r: Row): Task => ({
  id: r.id,
  title: r.title,
  notes: r.notes,
  estimateMinutes: r.estimate_minutes,
  day: r.day,
  sortOrder: r.sort_order,
  completedAt: r.completed_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export function cleanTitle(title: string): string {
  const t = title.replace(/\s+/g, ' ').trim();
  if (!t) throw new Error('A task needs a title.');
  return t.slice(0, 200);
}

function cleanEstimate(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v) || v <= 0) return null;
  return Math.min(Math.round(v), 24 * 60);
}

export function getTask(db: Db, id: string): Task | null {
  const r = db.get<Row>('SELECT * FROM tasks WHERE id = ?', [id]);
  return r ? toTask(r) : null;
}

/** Tasks planned for a day: open first in the user's order, then done. */
export function tasksForDay(db: Db, day: DayKey): Task[] {
  return db
    .all<Row>(
      'SELECT * FROM tasks WHERE day = ? ORDER BY (completed_at IS NOT NULL), sort_order, created_at',
      [day],
    )
    .map(toTask);
}

/** Unfinished tasks from earlier days. They stay where they were until the user moves them. */
export function unfinishedBefore(db: Db, day: DayKey): Task[] {
  return db
    .all<Row>(
      'SELECT * FROM tasks WHERE day < ? AND completed_at IS NULL ORDER BY day DESC, sort_order',
      [day],
    )
    .map(toTask);
}

function nextSort(db: Db, day: DayKey): number {
  const r = db.get<{ m: number | null }>('SELECT MAX(sort_order) AS m FROM tasks WHERE day = ?', [day]);
  return (r?.m ?? 0) + 1;
}

export function createTask(
  db: Db,
  input: { title: string; day: DayKey; estimateMinutes?: number | null; notes?: string | null },
  now = Date.now(),
): Task {
  const id = newId();
  db.run(
    `INSERT INTO tasks (id, title, notes, estimate_minutes, day, sort_order, completed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    [
      id,
      cleanTitle(input.title),
      input.notes?.trim() || null,
      cleanEstimate(input.estimateMinutes),
      input.day,
      nextSort(db, input.day),
      now,
      now,
    ],
  );
  return getTask(db, id)!;
}

export function updateTask(
  db: Db,
  id: string,
  patch: { title?: string; estimateMinutes?: number | null; notes?: string | null },
  now = Date.now(),
): void {
  const t = getTask(db, id);
  if (!t) return;
  db.run('UPDATE tasks SET title = ?, estimate_minutes = ?, notes = ?, updated_at = ? WHERE id = ?', [
    patch.title !== undefined ? cleanTitle(patch.title) : t.title,
    patch.estimateMinutes !== undefined ? cleanEstimate(patch.estimateMinutes) : t.estimateMinutes,
    patch.notes !== undefined ? patch.notes?.trim() || null : t.notes,
    now,
    id,
  ]);
}

export function setTaskCompleted(db: Db, id: string, completed: boolean, now = Date.now()): void {
  db.run('UPDATE tasks SET completed_at = ?, updated_at = ? WHERE id = ?', [completed ? now : null, now, id]);
}

export function deleteTask(db: Db, id: string): void {
  db.run('DELETE FROM tasks WHERE id = ?', [id]);
}

/** Swap with the neighbouring open task on the same day. */
export function moveTask(db: Db, id: string, direction: -1 | 1): void {
  db.transaction(() => {
    const t = getTask(db, id);
    if (!t || t.completedAt) return;
    const open = tasksForDay(db, t.day).filter((x) => !x.completedAt);
    const i = open.findIndex((x) => x.id === id);
    const j = i + direction;
    if (i < 0 || j < 0 || j >= open.length) return;
    const other = open[j];
    db.run('UPDATE tasks SET sort_order = ? WHERE id = ?', [other.sortOrder, t.id]);
    db.run('UPDATE tasks SET sort_order = ? WHERE id = ?', [t.sortOrder, other.id]);
    if (other.sortOrder === t.sortOrder) {
      db.run('UPDATE tasks SET sort_order = sort_order + ? WHERE id = ?', [direction * 0.5, t.id]);
    }
  });
}

/** Explicit, user-initiated: move tasks to a day, appended after that day's tasks. */
export function moveTasksToDay(db: Db, ids: string[], day: DayKey, now = Date.now()): void {
  db.transaction(() => {
    let sort = nextSort(db, day);
    for (const id of ids) {
      db.run('UPDATE tasks SET day = ?, sort_order = ?, updated_at = ? WHERE id = ?', [day, sort++, now, id]);
    }
  });
}
