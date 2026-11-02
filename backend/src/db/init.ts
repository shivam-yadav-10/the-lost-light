import fs from 'node:fs';
import { config } from '../config.js';
import { applySchema, closeDb, getDb } from './connection.js';
import { seed } from './seed.js';

const reset = process.argv.includes('--reset');

if (reset) {
  for (const suffix of ['', '-wal', '-shm']) {
    const file = config.dbPath + suffix;
    if (fs.existsSync(file)) fs.rmSync(file);
  }
  console.log(`Removed existing database at ${config.dbPath}`);
}

try {
  const db = getDb();
  applySchema(db);
  seed(db);
  const teams = db.prepare('SELECT COUNT(*) AS n FROM teams').get() as { n: number };
  const puzzles = db.prepare('SELECT COUNT(*) AS n FROM puzzles').get() as { n: number };
  console.log(`Database ready at ${config.dbPath} (${teams.n} teams, ${puzzles.n} puzzles)`);
} finally {
  closeDb();
}
