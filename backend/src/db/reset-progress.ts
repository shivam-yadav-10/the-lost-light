import { config } from '../config.js';
import { applySchema, closeDb, getDb, transaction } from './connection.js';
import { seed } from './seed.js';

/**
 * `npm run progress:reset`: gives every team a fresh start without deleting the database.
 * Clears solves, attempts, hints, checkpoints, Convergence shards, seal checks and the "story seen" flag;
 * keeps teams and puzzles.
 * Safe to run while the server is up (SQLite WAL), unlike `db:reset`, which deletes the file.
 */
const PROGRESS_TABLES = [
  'submissions',
  'team_progress',
  'checkpoint_visits',
  'convergence_verified',
  'convergence_shards',
  'seal_attempts',
];

try {
  const db = getDb();
  applySchema(db);
  seed(db);
  transaction(db, () => {
    for (const table of PROGRESS_TABLES) db.exec(`DELETE FROM ${table}`);
    db.exec('UPDATE teams SET last_seen_at = NULL, intro_seen_at = NULL');
  });
  console.log(`Progress cleared for every team in ${config.dbPath}`);
} finally {
  closeDb();
}
