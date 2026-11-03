import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  courtyardAnswer,
  GATES,
  INITIAL_MIRRORS,
  traceCourtyard,
} from '../src/services/courtyard.ts';

const SOLVED_LANTERNS = ['leaf', 'moon', 'lotus', 'bell', 'star'];
const SOLVED_MIRRORS = ['slash', 'backslash', 'slash'];

test('solved mirror arrangement visits all five gates in order and reaches the beacon', () => {
  const result = traceCourtyard(SOLVED_MIRRORS);
  assert.equal(result.reachedBeacon, true);
  assert.deepEqual(result.gates, [0, 1, 2, 3, 4]);
  assert.deepEqual(result.path.at(-1), { x: 0, y: 6 });
  assert.equal(GATES.length, 5);
});

test('starting mirror arrangement does not accidentally reveal a solved path', () => {
  const result = traceCourtyard(INITIAL_MIRRORS);
  assert.equal(result.reachedBeacon, false);
  assert.notDeepEqual(result.gates, [0, 1, 2, 3, 4]);
});

test('only a complete, unique lantern arrangement and connected beam can be submitted', () => {
  assert.equal(
    courtyardAnswer(SOLVED_LANTERNS, SOLVED_MIRRORS),
    'courtyard-v1 leaf moon lotus bell star slash backslash slash',
  );
  assert.throws(() => courtyardAnswer(['leaf', 'leaf', 'lotus', 'bell', 'star'], SOLVED_MIRRORS), /exactly once/);
  assert.throws(() => courtyardAnswer(['leaf', '', 'lotus', 'bell', 'star'], SOLVED_MIRRORS), /each of the five/);
  assert.throws(() => courtyardAnswer(SOLVED_LANTERNS, INITIAL_MIRRORS), /visits all five gates/);
  assert.throws(() => traceCourtyard(['slash']), /valid orientation/);
});
