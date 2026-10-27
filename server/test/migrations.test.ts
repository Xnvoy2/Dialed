import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { MIGRATIONS } from '../src/db/migrationFiles.js';

test('embedded migrations match migrations/*.sql (run npm run gen:migrations)', () => {
  const dir = resolve(import.meta.dirname, '../migrations');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  assert.deepEqual(MIGRATIONS.map((m) => m.name), files);
  for (const m of MIGRATIONS) assert.equal(m.sql, readFileSync(resolve(dir, m.name), 'utf8'));
});
