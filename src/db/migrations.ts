import { Db } from './driver';

/**
 * Ordered, append-only migrations. Never edit a shipped migration; add a new one.
 * Version is tracked with PRAGMA user_version.
 *
 * Time conventions:
 * - *_at columns are epoch milliseconds (UTC instants).
 * - *day columns are local calendar days 'YYYY-MM-DD', captured in the zone
 *   the user was in when the event happened. History never shifts when the
 *   device timezone later changes.
 */
export const MIGRATIONS: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
CREATE TABLE preferences (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  notes TEXT,
  estimate_minutes INTEGER CHECK (estimate_minutes IS NULL OR estimate_minutes > 0),
  day TEXT NOT NULL,
  sort_order REAL NOT NULL,
  completed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX tasks_day ON tasks(day, sort_order);

CREATE TABLE focus_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('focus','break')),
  task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  task_title_snapshot TEXT,
  planned_seconds INTEGER NOT NULL CHECK (planned_seconds > 0),
  status TEXT NOT NULL CHECK (status IN ('running','paused','completed','ended_early')),
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  active_seconds INTEGER,
  local_day TEXT NOT NULL,
  time_zone TEXT NOT NULL,
  utc_offset_minutes INTEGER NOT NULL,
  note TEXT,
  blocking_requested INTEGER NOT NULL DEFAULT 0,
  blocking_applied INTEGER NOT NULL DEFAULT 0,
  -- 1 while running/paused, NULL once finished. The unique index below makes
  -- a second open session impossible at the storage layer.
  open_slot INTEGER CHECK (open_slot IS NULL OR open_slot = 1)
);
CREATE UNIQUE INDEX focus_sessions_single_open ON focus_sessions(open_slot);
CREATE INDEX focus_sessions_day ON focus_sessions(local_day);

CREATE TABLE session_pauses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES focus_sessions(id) ON DELETE CASCADE,
  paused_at INTEGER NOT NULL,
  resumed_at INTEGER
);
CREATE INDEX session_pauses_session ON session_pauses(session_id);

CREATE TABLE habits (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('daily','weekdays','weekly')),
  weekdays_mask INTEGER NOT NULL DEFAULT 127,
  weekly_target INTEGER NOT NULL DEFAULT 1 CHECK (weekly_target BETWEEN 1 AND 7),
  start_day TEXT NOT NULL,
  sort_order REAL NOT NULL,
  archived_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE habit_checkins (
  id TEXT PRIMARY KEY NOT NULL,
  habit_id TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (habit_id, day)
);

CREATE TABLE habit_rest_days (
  habit_id TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (habit_id, day)
);
`,
  },
  {
    version: 2,
    sql: `
-- Lock-in mode: the user's own reason (shown on the shield), and what the
-- shield recorded. Counts only, never which app was opened.
ALTER TABLE focus_sessions ADD COLUMN reason TEXT;
ALTER TABLE focus_sessions ADD COLUMN blocking_error TEXT;
ALTER TABLE focus_sessions ADD COLUMN back_to_focus_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE focus_sessions ADD COLUMN deliberate_exit_count INTEGER NOT NULL DEFAULT 0;
`,
  },
];

export function currentVersion(db: Db): number {
  return db.get<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0;
}

export function migrate(db: Db): number {
  const from = currentVersion(db);
  for (const m of MIGRATIONS) {
    if (m.version <= from) continue;
    db.transaction(() => {
      db.exec(m.sql);
      db.exec(`PRAGMA user_version = ${m.version}`);
    });
  }
  return currentVersion(db);
}
