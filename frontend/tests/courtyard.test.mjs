import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  courtyardAnswer,
  BOARD_COLUMNS,
  BOARD_ROWS,
  GATES,
  INITIAL_MIRRORS,
  MIRRORS,
  nextLantern,
  traceCourtyard,
} from '../src/services/courtyard.ts';

const SOLVED_LANTERNS = ['leaf', 'moon', 'lotus', 'bell', 'star'];
const SOLVED_MIRRORS = [...'sbssbbssbbssbbssbbbb'].map((value) => value === 's' ? 'slash' : 'backslash');

test('solved mirror arrangement visits all five gates in order and reaches the beacon', () => {
  const result = traceCourtyard(SOLVED_MIRRORS);
  assert.equal(result.reachedBeacon, true);
  assert.deepEqual(result.gates, [0, 1, 2, 3, 4]);
  assert.deepEqual(result.path.at(-1), { x: 0, y: 1 });
  assert.equal(MIRRORS.length, 20);
  assert.deepEqual(result.mirrorsVisited, MIRRORS.map((_, index) => index));
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
    'courtyard-v3 leaf moon lotus bell star sbssbbssbbssbbssbbbb',
  );
  assert.ok(courtyardAnswer(SOLVED_LANTERNS, SOLVED_MIRRORS).length <= 200);
  assert.throws(() => courtyardAnswer(['leaf', 'leaf', 'lotus', 'bell', 'star'], SOLVED_MIRRORS), /exactly once/);
  assert.throws(() => courtyardAnswer(['leaf', '', 'lotus', 'bell', 'star'], SOLVED_MIRRORS), /each of the five/);
  assert.throws(() => courtyardAnswer(SOLVED_LANTERNS, INITIAL_MIRRORS), /visits all five gates/);
  assert.throws(() => traceCourtyard(['slash']), /valid orientation/);
});

test('all 1,048,576 mirror arrangements have exactly one full solution, with real decoy routes', () => {
  const winners = [];
  let decoyRoutes = 0;
  for (let bits = 0; bits < 2 ** MIRRORS.length; bits++) {
    const mirrors = MIRRORS.map((_, index) => (bits >> index) & 1 ? 'slash' : 'backslash');
    const beam = traceCourtyard(mirrors);
    if (beam.reachedBeacon && new Set(beam.gates).size === 5 && new Set(beam.mirrorsVisited).size === MIRRORS.length) winners.push(mirrors);
    if (beam.mirrorsVisited.some((id, index, visited) => index > 0 && id < visited[index - 1])) decoyRoutes++;
    assert.ok(beam.path.length < BOARD_COLUMNS * BOARD_ROWS * 4 + 2, 'trace terminates even for bad paths');
  }
  assert.deepEqual(winners, [SOLVED_MIRRORS]);
  assert.ok(decoyRoutes > 0, 'wrong turns can feed into earlier mirrors rather than only exit');
});

test('gate clicks cycle every symbol and then return to empty', () => {
  let symbol = '';
  const cycle = [];
  for (let click = 0; click < 6; click++) {
    symbol = nextLantern(symbol);
    cycle.push(symbol);
  }
  assert.deepEqual(cycle, ['lotus', 'star', 'leaf', 'bell', 'moon', '']);
  assert.equal(nextLantern(''), 'lotus');
});
