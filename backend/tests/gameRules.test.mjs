import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { config } from '../src/config.ts';
import { applySchema, closeDb, getDb } from '../src/db/connection.ts';
import { seed } from '../src/db/seed.ts';
import { getPuzzleForTeam, getTeamProgress, requestHint, submitAnswer } from '../src/services/gameEngine.ts';
import { FIVE_DAWNS_SETS, WORD_PUZZLE_ANSWERS } from '../src/content/protected.ts';

beforeEach(() => {
  config.dbPath = ':memory:';
  config.now = () => new Date('2026-11-11T00:00:00Z');
  applySchema(getDb());
  seed(getDb());
});
afterEach(() => closeDb());

function saveProgress(id, hints, status = 'solved', team = 1) {
  getDb().prepare(`
    INSERT OR REPLACE INTO team_progress (team_id, puzzle_id, status, hints_used)
    VALUES (?, ?, ?, ?)
  `).run(team, id, status, hints);
}

test('only question one is available on a fresh team even after all release times', () => {
  assert.deepEqual(getTeamProgress(1).puzzles.map((puzzle) => puzzle.state),
    ['AVAILABLE', 'LOCKED', 'LOCKED', 'LOCKED', 'LOCKED', 'LOCKED', 'LOCKED', 'LOCKED']);
  assert.throws(() => getPuzzleForTeam(1, 2), /still hidden/);
  assert.throws(() => requestHint(1, 2), /still hidden/);
});

for (let team = 1; team <= 4; team++) {
  test(`team ${team} receives its own QR riddle and can solve with four hidden words`, () => {
    for (const id of [1, 2, 3]) saveProgress(id, 0, 'solved', team);
    const puzzle = getPuzzleForTeam(team, 4);
    assert.equal(puzzle.blocks.some((block) => block.type === 'note' && block.text.includes(`poster ${team}.`)), true);
    const words = WORD_PUZZLE_ANSWERS[`W${team}`];
    const result = submitAnswer(team, 4, words.slice(0, 4).reverse().join(', ').toUpperCase());
    assert.equal(result.correct, true);
    assert.equal(getPuzzleForTeam(team, 4).state, 'SOLVED');
    assert.equal(getPuzzleForTeam(team, 5).state, 'AVAILABLE');
  });
}

test('QR challenge rejects too few distinct words and preserves hint usage on solve', () => {
  for (const id of [1, 2, 3]) saveProgress(id, 0);
  const words = WORD_PUZZLE_ANSWERS.W1;
  assert.equal(submitAnswer(1, 4, [words[0], words[0], words[1], words[2]].join(', ')).correct, false);
  assert.notEqual(getPuzzleForTeam(1, 4).state, 'SOLVED');
  getDb().prepare('UPDATE submissions SET submitted_at = ? WHERE team_id = 1 AND puzzle_id = 4')
    .run(new Date(Date.now() - 10_000).toISOString());
  requestHint(1, 4);
  assert.equal(submitAnswer(1, 4, words.slice(0, 4).join('; ')).correct, true);
  assert.equal(getPuzzleForTeam(1, 4).hintsUsed, 1);
});

test('solving the first question makes the second available but not the third', () => {
  saveProgress(1, 0);
  const progress = getTeamProgress(1).puzzles;
  assert.equal(progress[0].state, 'SOLVED');
  assert.equal(progress[1].state, 'AVAILABLE');
  assert.equal(progress[2].state, 'LOCKED');
  assert.equal(getPuzzleForTeam(1, 2).state, 'AVAILABLE');
});

test('old empty prerequisite metadata still enforces the predecessor', () => {
  getDb().prepare('UPDATE puzzles SET requires_json = ?').run('[]');
  assert.throws(() => getPuzzleForTeam(1, 3), /still hidden/);
  saveProgress(2, 0);
  assert.equal(getPuzzleForTeam(1, 3).state, 'AVAILABLE');
});

test('removing the release schedule does not bypass prerequisites', () => {
  getDb().prepare('UPDATE puzzles SET unlock_at = NULL').run();
  assert.throws(() => getPuzzleForTeam(1, 2), /still hidden/);
});

test('the third hint is persisted and the fourth is rejected without changing usage', () => {
  requestHint(1, 1);
  requestHint(1, 1);
  const result = requestHint(1, 1);
  assert.equal(result.hintsUsed, 3);
  assert.equal(result.hints.length, 3);
  assert.equal(result.teamHintsUsed, 3);
  assert.throws(() => requestHint(1, 1), /No more hints/);
  assert.equal(getPuzzleForTeam(1, 1).hintsUsed, 3);
});

test('the twelfth hint is persisted and the thirteenth is rejected across questions', () => {
  for (const id of [1, 2, 3]) saveProgress(id, 3);
  saveProgress(4, 2);
  const result = requestHint(1, 5);
  assert.equal(result.teamHintsUsed, 12);
  assert.equal(result.hintsUsed, 1);
  assert.throws(() => requestHint(1, 5), /all 12 hints/);
  assert.equal(getPuzzleForTeam(1, 5).hintsUsed, 1);
});

test('Convergence usage counts toward the allowance when requesting a Vault hint', () => {
  for (const id of [1, 2, 3]) saveProgress(id, 3);
  saveProgress(4, 1);
  saveProgress(5, 0);
  saveProgress(6, 0);
  saveProgress(7, 2);
  assert.throws(() => requestHint(1, 8), /all 12 hints/);
});

test('one team exhausting its allowance does not affect a different team', () => {
  for (const id of [1, 2, 3, 4]) saveProgress(id, 3);
  assert.throws(() => requestHint(1, 5), /all 12 hints/);
  assert.equal(requestHint(2, 1).teamHintsUsed, 1);
});

test('saved hint usage remains after a question is solved and is counted on the next', () => {
  requestHint(1, 1);
  requestHint(1, 1);
  saveProgress(1, 2);
  assert.equal(getPuzzleForTeam(1, 1).hintsUsed, 2);
  assert.equal(requestHint(1, 2).teamHintsUsed, 3);
});

test('a late login never resets elapsed scoring from the first scheduled unlock', () => {
  for (const id of [1, 2, 3, 4, 5, 6, 7]) saveProgress(id, id === 1 ? 3 : 0);
  saveProgress(8, 0);
  getDb().prepare('UPDATE team_progress SET solved_at = ? WHERE team_id = 1 AND puzzle_id = 8')
    .run('2026-11-10T08:30:00.000Z');
  getDb().prepare('UPDATE teams SET last_seen_at = ? WHERE id = 1').run('2026-11-10T10:45:00.000Z');

  const progress = getTeamProgress(1);
  assert.equal(progress.scheduleStartAt, '2026-11-10T07:30:00.000Z');
  assert.equal(progress.totalHintsUsed, 3);
  assert.equal(progress.penaltyMinutes, 30);
  assert.equal(progress.elapsedMs, 60 * 60_000);
  assert.equal(progress.adjustedElapsedMs, 90 * 60_000);
});

test('knowing the final word cannot bypass missing, incomplete or incorrect day answers', () => {
  for (const id of [1, 2, 3, 4]) saveProgress(id, 0);
  const set = FIVE_DAWNS_SETS[0];
  for (const proof of [
    undefined, 'invalid json', JSON.stringify(set.lines.slice(0, 4)),
    JSON.stringify([...set.lines.slice(0, 4), '']),
    JSON.stringify(['WRONG', ...set.lines.slice(1)]),
    JSON.stringify(FIVE_DAWNS_SETS[1].lines),
  ]) {
    assert.throws(() => submitAnswer(1, 5, set.final, proof), /all five day riddles/);
    assert.notEqual(getTeamProgress(1).puzzles[4].state, 'SOLVED');
  }
});

for (const [index, set] of FIVE_DAWNS_SETS.entries()) {
  test(`five correct day answers and final word complete riddle set ${set.group}`, () => {
    if (index >= 4) getDb().prepare('INSERT INTO teams (id, name, game_key) VALUES (?, ?, ?)').run(index + 1, `Test ${index}`, `TEST-${index}`);
    const teamId = index + 1;
    for (const id of [1, 2, 3, 4]) saveProgress(id, 0, 'solved', teamId);
    const result = submitAnswer(teamId, 5, set.final, JSON.stringify(set.lines.map((line) => line.toLowerCase())));
    assert.equal(result.correct, true);
    assert.equal(result.puzzle.state, 'SOLVED');
  });
}
