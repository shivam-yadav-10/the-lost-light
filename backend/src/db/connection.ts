import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

export type Db = DatabaseSync;

const here = path.dirname(fileURLToPath(import.meta.url));

let instance: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (instance) return instance;
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  instance = new DatabaseSync(config.dbPath);
  instance.exec('PRAGMA journal_mode = WAL');
  instance.exec('PRAGMA foreign_keys = ON');
  return instance;
}

export function applySchema(db: DatabaseSync): void {
  const schema = fs.readFileSync(path.join(here, 'schema.sql'), 'utf8');
  db.exec(schema);
  // Additive migration for databases created before puzzles gained multiple prerequisites.
  const columns = db.prepare('PRAGMA table_info(puzzles)').all() as unknown as { name: string }[];
  if (!columns.some((c) => c.name === 'requires_json')) {
    db.exec("ALTER TABLE puzzles ADD COLUMN requires_json TEXT NOT NULL DEFAULT '[]'");
  }
  const teamColumns = db.prepare('PRAGMA table_info(teams)').all() as unknown as { name: string }[];
  if (!teamColumns.some((c) => c.name === 'intro_seen_at')) {
    db.exec('ALTER TABLE teams ADD COLUMN intro_seen_at TEXT');
  }
}

/** Runs `fn` inside a transaction; rolls back on any throw. */
export function transaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function closeDb(): void {
  instance?.close();
  instance = null;
}

type Param = string | number | null;

/** Typed wrappers; node:sqlite returns Record<string, SQLOutputValue>. */
export function queryAll<T>(sql: string, ...params: Param[]): T[] {
  return getDb().prepare(sql).all(...params) as unknown as T[];
}

export function queryOne<T>(sql: string, ...params: Param[]): T | undefined {
  return getDb().prepare(sql).get(...params) as unknown as T | undefined;
}
