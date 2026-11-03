import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assertHintAvailable,
  hintCount,
  MAX_TEAM_HINTS,
  PUZZLE_IDS,
  puzzleHintLimit,
  puzzleRequirements,
} from '../src/services/gameRules.ts';
import { isInspectionShortcut, restrictInspection } from '../src/services/browserRestrictions.ts';

test('the first question is playable without a predecessor', () => {
  assert.deepEqual(puzzleRequirements(1, []), []);
});

for (const id of PUZZLE_IDS.slice(1)) {
  test(`question ${id} requires its predecessor even with old empty metadata`, () => {
    assert.deepEqual(puzzleRequirements(id, []), [id - 1]);
  });
}

test('Echo retains its five prerequisites without duplicating its predecessor', () => {
  assert.deepEqual(puzzleRequirements(6, [1, 2, 3, 4, 5]), [1, 2, 3, 4, 5]);
});

test('Convergence and Vault still require the preceding question', () => {
  assert.deepEqual(puzzleRequirements(7, [1, 2, 3, 4, 5, 6]), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(puzzleRequirements(8, [7]), [7]);
});

test('invalid puzzle IDs are rejected', () => {
  for (const id of [0, -1, 9, 1.5, NaN]) assert.throws(() => puzzleRequirements(id, []));
});

test('question hints are capped at three and never exceed provisioned content', () => {
  assert.equal(puzzleHintLimit(8), 3);
  assert.equal(puzzleHintLimit(3), 3);
  assert.equal(puzzleHintLimit(2), 2);
  assert.equal(puzzleHintLimit(0), 0);
});

test('invalid saved hint counts and missing metadata are rejected', () => {
  for (const value of [-1, 0.5, NaN, '3', Infinity]) {
    assert.throws(() => hintCount(value));
    assert.throws(() => puzzleHintLimit(value));
  }
  assert.equal(hintCount(undefined), 0);
  assert.throws(() => puzzleHintLimit(undefined));
});

test('the twelfth team hint is allowed but the thirteenth is rejected', () => {
  assert.equal(MAX_TEAM_HINTS, 12);
  assert.doesNotThrow(() => assertHintAvailable(0, 11, 3));
  assert.throws(() => assertHintAvailable(0, 12, 3), /all 12 hints/);
  assert.throws(() => assertHintAvailable(0, 15, 3), /all 12 hints/);
});

test('the third question hint is allowed but a fourth is rejected', () => {
  assert.doesNotThrow(() => assertHintAvailable(2, 2, 3));
  assert.throws(() => assertHintAvailable(3, 3, 3), /this fragment/);
});

test('exhausting a question does not exhaust another question but preserves the total', () => {
  assert.throws(() => assertHintAvailable(3, 3, 3));
  assert.doesNotThrow(() => assertHintAvailable(0, 3, 3));
  assert.throws(() => assertHintAvailable(0, 12, 3));
});

test('a question with no provisioned hints cannot consume the team allowance', () => {
  assert.throws(() => assertHintAvailable(0, 0, 0));
});

const shortcut = (key, modifiers = {}) => ({
  key, ctrlKey: false, shiftKey: false, metaKey: false, altKey: false, ...modifiers,
});

test('common Windows and macOS inspection shortcuts are detected', () => {
  for (const key of ['I', 'J', 'C']) {
    assert.equal(isInspectionShortcut(shortcut(key, { ctrlKey: true, shiftKey: true })), true);
    assert.equal(isInspectionShortcut(shortcut(key, { metaKey: true, altKey: true })), true);
  }
  assert.equal(isInspectionShortcut(shortcut('F12')), true);
  assert.equal(isInspectionShortcut(shortcut('u', { ctrlKey: true })), true);
});

test('typing, copying, pasting, tabbing and refresh shortcuts are unaffected', () => {
  for (const event of [
    shortcut('i'), shortcut('Tab'), shortcut('F5'),
    shortcut('c', { ctrlKey: true }), shortcut('v', { ctrlKey: true }),
    shortcut('r', { ctrlKey: true }),
  ]) assert.equal(isInspectionShortcut(event), false);
});

test('page restrictions prevent default behavior and remove listeners on cleanup', () => {
  const target = new EventTarget();
  const cleanup = restrictInspection(target);
  const menu = new Event('contextmenu', { cancelable: true });
  target.dispatchEvent(menu);
  assert.equal(menu.defaultPrevented, true);
  const keydown = Object.assign(new Event('keydown', { cancelable: true }), shortcut('I', { ctrlKey: true, shiftKey: true }));
  target.dispatchEvent(keydown);
  assert.equal(keydown.defaultPrevented, true);
  cleanup();
  const afterCleanup = new Event('contextmenu', { cancelable: true });
  target.dispatchEvent(afterCleanup);
  assert.equal(afterCleanup.defaultPrevented, false);
});
