import { DatabaseSync } from 'node:sqlite';
import { Db, SqlValue, execTransaction } from '../src/db/driver';

/** Real SQLite (Node built-in) behind the same interface the app uses. */
export function openNodeDb(path = ':memory:'): Db {
  const raw = new DatabaseSync(path);
  raw.exec('PRAGMA foreign_keys = ON;');
  let depth = 0;
  const db: Db = {
    exec: (sql) => raw.exec(sql),
    run: (sql, params: SqlValue[] = []) => {
      const r = raw.prepare(sql).run(...params);
      return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
    },
    all: <T,>(sql: string, params: SqlValue[] = []) => raw.prepare(sql).all(...params) as T[],
    get: <T,>(sql: string, params: SqlValue[] = []) => (raw.prepare(sql).get(...params) as T) ?? null,
    transaction: <T,>(fn: () => T): T => {
      if (depth > 0) return fn();
      depth++;
      try {
        return execTransaction(db, fn);
      } finally {
        depth--;
      }
    },
  };
  return db;
}
