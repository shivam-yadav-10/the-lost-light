import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkHiddenWords, parseHiddenWords } from '../src/services/hiddenWords.ts';

const expected = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta'];

test('four, five, or six distinct correct words pass in any order and case', () => {
  for (let size = 4; size <= 6; size++) {
    assert.equal(checkHiddenWords(expected.slice(0, size).reverse().join(', ').toUpperCase(), expected), true);
  }
  assert.equal(checkHiddenWords('alpha beta gamma delta wrong typo', expected), true);
});

test('three correct words, duplicates, partial matches, and dictionary dumps do not pass', () => {
  for (const raw of ['', 'alpha beta gamma', 'alpha alpha beta gamma', 'alph beta gamma delta',
    'alpha beta gamma unknown', expected.join(' ') + ' extra', 'alpha! beta gamma delta']) {
    assert.equal(checkHiddenWords(raw, expected), false, raw);
  }
});

test('commas, whitespace, semicolons, and newlines separate words without combining them', () => {
  assert.deepEqual(parseHiddenWords(' ALPHA, beta;\ngamma  delta '), ['alpha', 'beta', 'gamma', 'delta']);
  assert.equal(checkHiddenWords('alphabeta gamma delta', expected), false);
});

test('missing or malformed answer data fails explicitly', () => {
  for (const value of [undefined, [], ['Alpha'], [...expected.slice(1), 'BETA'], [...expected.slice(1), 5]]) {
    assert.throws(() => checkHiddenWords('alpha beta gamma delta', value), /answer data is incomplete/);
  }
});
