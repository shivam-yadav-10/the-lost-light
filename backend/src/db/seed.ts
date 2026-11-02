import type { Db } from './connection.js';
import { normaliseAnswer } from '../services/normalise.js';
import { PUBLIC_PUZZLES } from '../content/public.js';
import { CHECKPOINTS, protectedPuzzle } from '../content/protected.js';
import { SEED_TEAMS } from '../content/teams.js';

export { SEED_TEAMS };

/**
 * Loads content into SQLite. Safe to re-run: puzzles, hints and checkpoints are upserted from
 * `src/content`, so content fixes apply without touching team progress. Teams are only inserted
 * if missing.
 */
export function seed(db: Db): void {
  const insertTeam = db.prepare('INSERT OR IGNORE INTO teams (name, game_key) VALUES (?, ?)');
  for (const team of SEED_TEAMS) insertTeam.run(team.name, team.gameKey);

  const upsertPuzzle = db.prepare(`
    INSERT INTO puzzles
      (id, slug, title, fragment_name, kind, sort_order, intro, body, answer, unlock_at, requires_puzzle_id, requires_json, max_hints)
    VALUES
      (@id, @slug, @title, @fragmentName, @kind, @sortOrder, @intro, @body, @answer, @unlockAt, NULL, @requiresJson, @maxHints)
    ON CONFLICT(id) DO UPDATE SET
      slug = excluded.slug, title = excluded.title, fragment_name = excluded.fragment_name, kind = excluded.kind,
      sort_order = excluded.sort_order, intro = excluded.intro, body = excluded.body, answer = excluded.answer,
      unlock_at = excluded.unlock_at, requires_puzzle_id = NULL, requires_json = excluded.requires_json,
      max_hints = excluded.max_hints
  `);
  const deleteHints = db.prepare('DELETE FROM hints WHERE puzzle_id = ?');
  const insertHint = db.prepare('INSERT INTO hints (puzzle_id, hint_order, text) VALUES (?, ?, ?)');

  for (const p of PUBLIC_PUZZLES) {
    const secret = protectedPuzzle(p.id);
    upsertPuzzle.run({
      id: p.id,
      slug: p.slug,
      title: p.title,
      fragmentName: p.fragmentName,
      kind: p.kind,
      sortOrder: p.sortOrder,
      intro: p.intro,
      body: JSON.stringify(p.variants ? { blocks: p.blocks, variants: p.variants } : p.blocks),
      // Team-specific answers (Convergence) have no canonical answer; validation lives in the engine.
      answer: secret.answers[0] ? normaliseAnswer(secret.answers[0]) : '',
      unlockAt: p.unlockAt,
      requiresJson: JSON.stringify(p.requires),
      maxHints: secret.hints.length,
    });
    deleteHints.run(p.id);
    secret.hints.forEach((h, i) => insertHint.run(p.id, i + 1, h.text));
  }

  const upsertCheckpoint = db.prepare(`
    INSERT INTO checkpoints (code, title, message, puzzle_id) VALUES (?, ?, ?, ?)
    ON CONFLICT(code) DO UPDATE SET title = excluded.title, message = excluded.message, puzzle_id = excluded.puzzle_id
  `);
  const codes = CHECKPOINTS.map((c) => normaliseAnswer(c.code));
  for (const c of CHECKPOINTS) upsertCheckpoint.run(normaliseAnswer(c.code), c.title, c.message, c.puzzleId);
  // Drop checkpoints that are no longer in the content (e.g. the old placeholder marker).
  db.prepare(`DELETE FROM checkpoints WHERE code NOT IN (${codes.map(() => '?').join(',')})`).run(...codes);
}
