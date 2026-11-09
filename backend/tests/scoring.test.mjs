import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PUBLIC_PUZZLES } from '../src/content/public.ts';
import { protectedPuzzle } from '../src/content/protected.ts';
import { EVENT_START_AT, rankTeams, scoreCompletion } from '../src/services/scoring.ts';

test('core release boundaries match the 13:00–14:40 IST twenty-minute schedule', () => {
  assert.deepEqual(
    PUBLIC_PUZZLES.filter((puzzle) => puzzle.kind === 'core').map((puzzle) => puzzle.unlockAt),
    [
      '2026-11-10T07:30:00.000Z',
      '2026-11-10T07:50:00.000Z',
      '2026-11-10T08:10:00.000Z',
      '2026-11-10T08:30:00.000Z',
      '2026-11-10T08:50:00.000Z',
      '2026-11-10T09:10:00.000Z',
    ],
  );
  assert.equal(PUBLIC_PUZZLES.find((puzzle) => puzzle.id === 7).unlockAt, null);
  assert.equal(PUBLIC_PUZZLES.find((puzzle) => puzzle.id === 8).unlockAt, null);
});

test('scores measure elapsed time from the fixed start, plus the existing hint penalties', () => {
  assert.equal(EVENT_START_AT, '2026-11-10T07:30:00.000Z');
  assert.deepEqual(scoreCompletion('2026-11-10T08:30:00.000Z', 30), {
    elapsedMs: 60 * 60_000,
    adjustedElapsedMs: 90 * 60_000,
  });
  assert.equal(scoreCompletion('2026-11-10T07:00:00.000Z', 0).elapsedMs, 0);
  assert.equal(scoreCompletion(null, 0), null);
  assert.deepEqual(
    protectedPuzzle(1).hints.map((hint) => hint.penaltyMinutes),
    [5, 10, 15],
  );
});

test('ranking places finishers first and resolves ties with hints then team ID', () => {
  const result = rankTeams([
    { id: 8, completedAt: null, penaltyMinutes: 0, totalHintsUsed: 0 },
    { id: 4, completedAt: '2026-11-10T08:30:00.000Z', penaltyMinutes: 15, totalHintsUsed: 2 },
    { id: 3, completedAt: '2026-11-10T08:35:00.000Z', penaltyMinutes: 10, totalHintsUsed: 1 },
    { id: 2, completedAt: '2026-11-10T08:30:00.000Z', penaltyMinutes: 15, totalHintsUsed: 1 },
    { id: 1, completedAt: null, penaltyMinutes: 0, totalHintsUsed: 4 },
  ]);
  assert.deepEqual(result.map(({ team, rank }) => [team.id, rank]), [[2, 1], [3, 2], [4, 3], [8, 4], [1, 5]]);
  assert.equal(result[3].adjustedElapsedMs, null);
});
