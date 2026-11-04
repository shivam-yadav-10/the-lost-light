import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countdownParts, nextRelease } from '../src/services/gameClock.ts';

test('countdown includes days, rounds up and never goes negative', () => {
  assert.deepEqual(countdownParts(90061000, 0).map((part) => part.value), ['01', '01', '01', '01']);
  assert.deepEqual(countdownParts(1, 0).map((part) => part.value), ['00', '00', '01']);
  assert.deepEqual(countdownParts(0, 1000).map((part) => part.value), ['00', '00', '00']);
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
