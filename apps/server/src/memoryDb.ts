/// <reference types="node" />
// D1's interface over an in-memory SQLite with the real migrations, for tests.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import type { Db, Stmt } from './stats';

export function memoryDb(): Db {
  const sqlite = new DatabaseSync(':memory:');
  const dir = join(dirname(fileURLToPath(import.meta.url)), '../migrations');
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    sqlite.exec(readFileSync(join(dir, file), 'utf8'));
  }
  const stmt = (sql: string, values: unknown[] = []): Stmt => {
    const s = () => sqlite.prepare(sql);
    const v = values as never[];
    return {
      bind: (...more) => stmt(sql, more),
      run: async () => s().run(...v),
      all: async <T>() => ({ results: s().all(...v) as T[] }),
      first: async <T>() => (s().get(...v) as T | undefined) ?? null,
    };
  };
  return {
    prepare: (sql) => stmt(sql),
    batch: async (statements) => {
      for (const st of statements) await st.run();
    },
  };
}
