/**
 * The small synchronous SQL surface the repositories need.
 * On device it wraps expo-sqlite; in tests it wraps Node's built-in node:sqlite,
 * so repository tests run against real SQLite rather than a mock.
 */
export type SqlValue = string | number | null;

export interface Db {
  exec(sql: string): void;
  run(sql: string, params?: SqlValue[]): { changes: number; lastInsertRowId: number };
  all<T>(sql: string, params?: SqlValue[]): T[];
  get<T>(sql: string, params?: SqlValue[]): T | null;
  /** Runs fn inside a transaction; rolls back if it throws. */
  transaction<T>(fn: () => T): T;
}

/** Shared transaction helper for drivers that only expose exec(). */
export function execTransaction<T>(db: Pick<Db, 'exec'>, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
