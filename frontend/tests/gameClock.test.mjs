import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countdownParts, hasReleasedQuestion, nextRelease } from '../src/services/gameClock.ts';

test('countdown includes days, rounds up and never goes negative', () => {
  assert.deepEqual(countdownParts(90061000, 0).map((part) => part.value), ['01', '01', '01', '01']);
  assert.deepEqual(countdownParts(1, 0).map((part) => part.value), ['00', '00', '01']);
  assert.deepEqual(countdownParts(0, 1000).map((part) => part.value), ['00', '00', '00']);
});

test('waiting gate follows effective releases and ignores endgame questions', () => {
  const now = Date.parse('2026-11-04T07:00:00Z');
  const puzzles = [
    { id: 1, state: 'LOCKED', unlockAt: '2026-11-10T07:30:00Z' },
    { id: 2, state: 'LOCKED', unlockAt: '2026-11-10T08:00:00Z' },
    { id: 7, state: 'LOCKED', unlockAt: null },
  ];
  assert.equal(hasReleasedQuestion(puzzles, now), false);
  assert.equal(nextRelease(puzzles, now).id, 1);
  const overridden = [{ ...puzzles[0], state: 'AVAILABLE', unlockAt: new Date(now - 1).toISOString() }, ...puzzles.slice(1)];
  assert.equal(hasReleasedQuestion(overridden, now), true);
  assert.equal(nextRelease(overridden, now).id, 2);
  assert.equal(hasReleasedQuestion(puzzles, Date.parse(puzzles[0].unlockAt)), true);
  assert.equal(nextRelease(puzzles, Date.parse(puzzles[1].unlockAt)), null);
});

test('next release ignores solved questions, unscheduled gates and timestamps already reached', () => {
  const puzzles = [
    { id: 1, state: 'SOLVED', unlockAt: '2026-11-10T07:30:00Z' },
    { id: 2, state: 'LOCKED', unlockAt: '2026-11-10T08:00:00Z' },
    { id: 3, state: 'LOCKED', unlockAt: '2026-11-10T08:30:00Z' },
    { id: 7, state: 'LOCKED', unlockAt: null },
  ];
  assert.equal(nextRelease(puzzles, Date.parse('2026-11-10T07:00:00Z')).id, 2);
  assert.equal(nextRelease(puzzles, Date.parse('2026-11-10T08:00:00Z')).id, 3);
  assert.equal(nextRelease(puzzles, Date.parse('2026-11-10T08:30:00Z')), null);
});
