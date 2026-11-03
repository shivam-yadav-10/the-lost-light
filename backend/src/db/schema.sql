PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS teams (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL UNIQUE,
  game_key      TEXT    NOT NULL UNIQUE,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_seen_at  TEXT,
  intro_seen_at TEXT                          -- when the team first finished or skipped the opening story
);

-- kind: 'core' (6 fragments), 'convergence' (cross-team), 'vault' (final)
CREATE TABLE IF NOT EXISTS puzzles (
  id            INTEGER PRIMARY KEY,
  slug          TEXT    NOT NULL UNIQUE,
  title         TEXT    NOT NULL,
  fragment_name TEXT    NOT NULL,
  kind          TEXT    NOT NULL CHECK (kind IN ('core','convergence','vault')),
  sort_order    INTEGER NOT NULL,
  intro         TEXT    NOT NULL,
  body          TEXT    NOT NULL,            -- JSON array of content blocks (see src/content/types.ts)
  answer        TEXT    NOT NULL,            -- canonical normalised answer, never returned to clients
  unlock_at     TEXT,                        -- ISO timestamp; NULL = no time gate
  requires_puzzle_id INTEGER REFERENCES puzzles(id), -- legacy single prerequisite (unused by content)
  requires_json TEXT    NOT NULL DEFAULT '[]', -- JSON array of puzzle ids that must be solved first
  max_hints     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS hints (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  puzzle_id   INTEGER NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
  hint_order  INTEGER NOT NULL,
  text        TEXT    NOT NULL,
  UNIQUE (puzzle_id, hint_order)
);

CREATE TABLE IF NOT EXISTS team_progress (
  team_id       INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  puzzle_id     INTEGER NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
  status        TEXT    NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','solved')),
  hints_used    INTEGER NOT NULL DEFAULT 0,
  started_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  solved_at     TEXT,
  PRIMARY KEY (team_id, puzzle_id)
);

CREATE TABLE IF NOT EXISTS submissions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id       INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  puzzle_id     INTEGER NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
  answer        TEXT    NOT NULL,
  is_correct    INTEGER NOT NULL,
  submitted_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_submissions_team_puzzle ON submissions(team_id, puzzle_id);

-- Physical checkpoints: QR/plaque codes placed around the office.
CREATE TABLE IF NOT EXISTS checkpoints (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT    NOT NULL UNIQUE,       -- normalised code printed at the location
  title       TEXT    NOT NULL,
  message     TEXT    NOT NULL,              -- revealed to the team on scan
  puzzle_id   INTEGER REFERENCES puzzles(id) -- optional: checkpoint belongs to a puzzle
);

CREATE TABLE IF NOT EXISTS checkpoint_visits (
  team_id        INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  checkpoint_id  INTEGER NOT NULL REFERENCES checkpoints(id) ON DELETE CASCADE,
  visited_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (team_id, checkpoint_id)
);

-- The Convergence: shard type handed to each team (arrival order) and shards it has verified.
CREATE TABLE IF NOT EXISTS convergence_shards (
  team_id      INTEGER PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
  shard_type   TEXT    NOT NULL CHECK (shard_type IN ('A','B','C','D')),
  assigned_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS convergence_verified (
  team_id      INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  shard_type   TEXT    NOT NULL CHECK (shard_type IN ('A','B','C','D')),
  verified_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (team_id, shard_type)
);

CREATE TABLE IF NOT EXISTS seal_attempts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id       INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  ok            INTEGER NOT NULL,
  attempted_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_seal_attempts_team ON seal_attempts(team_id, attempted_at);

-- V2 circles are provisioned once, independently of legacy shard history.
CREATE TABLE IF NOT EXISTS convergence_circles (
  team_id INTEGER PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
  members_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS convergence_arrivals (
  team_id INTEGER PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
  reached_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS convergence_seals (
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  partner_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  PRIMARY KEY (team_id, partner_id)
);
