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
  teamCourtyardPosition,
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

test('team positions are stable, distinct, ordered and keep controls separated', () => {
  const layouts = new Set();
  for (let team = 1; team <= 1000; team++) {
    const arrange = teamCourtyardPosition(`TEAM-${team}`);
    const points = [...GATES, ...MIRRORS].map(arrange);
    const layout = JSON.stringify(points);
    assert.equal(JSON.stringify([...GATES, ...MIRRORS].map(teamCourtyardPosition(`TEAM-${team}`))), layout);
    layouts.add(layout);
    for (let x = 1; x < BOARD_COLUMNS; x++) {
      assert.ok(arrange({ x, y: 0 }).x > arrange({ x: x - 1, y: 0 }).x);
    }
    for (let y = 1; y < BOARD_ROWS; y++) {
      assert.ok(arrange({ x: 0, y }).y > arrange({ x: 0, y: y - 1 }).y);
    }
    for (let i = 0; i < points.length; i++) {
      assert.ok(points[i].x >= 0 && points[i].x < BOARD_COLUMNS);
      assert.ok(points[i].y >= 0 && points[i].y < BOARD_ROWS);
      for (let j = i + 1; j < points.length; j++) {
        const dx = Math.abs(points[i].x - points[j].x) * 80 * 610 / (BOARD_COLUMNS * 80 + 40);
        const dy = Math.abs(points[i].y - points[j].y) * 80 * 540 / (BOARD_ROWS * 80 + 40);
        assert.ok(dx >= 44 || dy >= 44, `Overlapping controls for team ${team}`);
      }
    }
    const route = traceCourtyard(SOLVED_MIRRORS).path.map(arrange);
    for (let i = 1; i < route.length; i++) {
      assert.ok(route[i].x === route[i - 1].x || route[i].y === route[i - 1].y);
    }
  }
  assert.equal(layouts.size, 1000);
  assert.throws(() => teamCourtyardPosition(''), /team is required/);
});
