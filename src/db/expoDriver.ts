import * as SQLite from 'expo-sqlite';
import { Db, SqlValue, execTransaction } from './driver';

export const DATABASE_NAME = 'lockin.db';

export function openExpoDb(name = DATABASE_NAME): Db {
  const raw = SQLite.openDatabaseSync(name);
  raw.execSync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  let depth = 0;
  const db: Db = {
    exec: (sql) => raw.execSync(sql),
    run: (sql, params: SqlValue[] = []) => {
      const r = raw.runSync(sql, params);
      return { changes: r.changes, lastInsertRowId: r.lastInsertRowId };
    },
    all: <T,>(sql: string, params: SqlValue[] = []) => raw.getAllSync<T>(sql, params),
    get: <T,>(sql: string, params: SqlValue[] = []) => raw.getFirstSync<T>(sql, params) ?? null,
    transaction: <T,>(fn: () => T): T => {
      // Nested calls join the outer transaction.
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
