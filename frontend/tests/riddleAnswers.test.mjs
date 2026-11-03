import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkRiddleAnswers, parseRiddleProof } from '../src/services/riddleAnswers.ts';

const expected = ['ALPHA', 'BETA', 'GAMMA', 'DELTA', 'EPSILON'];

test('every day must have the correct answer, not just a marked letter or the right length', () => {
  assert.deepEqual(checkRiddleAnswers(['ALPHA', 'BETA', 'GAMMA', 'DELTA', ''], expected), [true, true, true, true, false]);
  assert.deepEqual(checkRiddleAnswers(['ALPXA', 'BETA', 'GAMMA', 'DELTA', 'EPSILON'], expected), [false, true, true, true, true]);
  assert.equal(checkRiddleAnswers(['A', 'B', 'G', 'D', 'E'], expected).every(Boolean), false);
  assert.equal(checkRiddleAnswers([], expected).every(Boolean), false);
});

test('letter case, spacing and punctuation do not prevent a correct day answer', () => {
  assert.equal(checkRiddleAnswers(['alpha', 'be ta', 'gam-ma', 'delta!', 'EPSILON'], expected).every(Boolean), true);
});

test('missing expected answers fail explicitly instead of allowing an unchecked submission', () => {
  for (const value of [undefined, [], ['ALPHA'], 'ALPHA']) {
    assert.throws(() => checkRiddleAnswers(expected, value), /Riddle answer data is missing/);
  }
});

test('proof requires all five strings and rejects malformed or oversized answers', () => {
  assert.deepEqual(parseRiddleProof(JSON.stringify(expected)), expected);
  for (const proof of [undefined, 'not json', '{}', 'null', '[]', '["A","B","C","D",5]',
    JSON.stringify(['A'.repeat(41), ...expected.slice(1)])]) {
    assert.deepEqual(parseRiddleProof(proof), []);
  }
});
