import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  port: Number(process.env.PORT ?? 4000),
  dbPath: process.env.DB_PATH ?? path.resolve(here, '../data/game.db'),
  // Local-only admin key. Override with ADMIN_KEY env for anything beyond local dev.
  adminKey: process.env.ADMIN_KEY ?? 'local-admin',
  // Derives every team's Convergence lantern, key and seal. Set a long random value for the event
  // and never change it once the Convergence has started.
  gameSecret: process.env.GAME_SECRET ?? 'local-dev-secret',
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  // ISO timestamp; puzzles with unlock_at before this are available. Override to simulate day-of.
  now: (): Date => (process.env.FAKE_NOW ? new Date(process.env.FAKE_NOW) : new Date()),
};
