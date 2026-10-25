import { Db } from '../db/driver';
import { currentVersion } from '../db/migrations';

const TABLES = ['tasks', 'focus_sessions', 'session_pauses', 'habits', 'habit_checkins', 'habit_rest_days', 'preferences'];

/** Everything stored locally, as plain JSON. Includes private notes; it is the user's own file. */
export function exportAll(db: Db, appName: string, now = Date.now()) {
  const data: Record<string, unknown[]> = {};
  for (const t of TABLES) data[t] = db.all(`SELECT * FROM ${t}`);
  return {
    format: 'lockin-export',
    app: appName,
    schemaVersion: currentVersion(db),
    exportedAt: new Date(now).toISOString(),
    note: 'Timestamps (*_at) are Unix milliseconds. Day fields are local calendar days.',
    data,
  };
}

/** Removes all productivity data and preferences. The schema stays. */
export function deleteAll(db: Db): void {
  db.transaction(() => {
    // Children first, though cascades would also handle it.
    for (const t of ['session_pauses', 'habit_checkins', 'habit_rest_days', 'focus_sessions', 'tasks', 'habits', 'preferences']) {
      db.run(`DELETE FROM ${t}`);
    }
  });
}
