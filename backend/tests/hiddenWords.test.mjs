import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkHiddenWords } from '../src/services/hiddenWords.ts';
import { WORD_PUZZLE_ANSWERS, variantKey } from '../src/content/protected.ts';
import { WORD_PUZZLE_POSTERS, PUBLIC_PUZZLES } from '../src/content/public.ts';
import { provisionWordPuzzles } from '../src/scripts/provision-word-puzzles.ts';

test('all nine image mappings accept every four-word subset in any order', () => {
  for (const words of Object.values(WORD_PUZZLE_ANSWERS)) {
    for (let mask = 0; mask < 64; mask++) {
      const selected = words.filter((_, index) => mask & (1 << index));
      assert.equal(checkHiddenWords(selected.reverse().join(', ').toUpperCase(), words), selected.length >= 4);
    }
    assert.equal(checkHiddenWords(words.slice(0, 3).concat(words[0]).join(' '), words), false);
    assert.equal(checkHiddenWords(words.join(' ') + ' extra', words), false);
  }
  assert.throws(() => checkHiddenWords('one two three four', undefined), /incomplete/);
});

test('another image does not unlock the assigned challenge', () => {
  for (const [own, expected] of Object.entries(WORD_PUZZLE_ANSWERS)) {
    for (const [other, words] of Object.entries(WORD_PUZZLE_ANSWERS)) {
      if (own !== other) assert.equal(checkHiddenWords(words.join(', '), expected), false);
    }
  }
});

test('roster numbering consistently assigns all nine variants and location counts', () => {
  const groups = Object.keys(PUBLIC_PUZZLES.find((puzzle) => puzzle.id === 4).variants);
  for (let number = 1; number <= 27; number++) {
    assert.equal(variantKey(number, groups), `W${((number - 1) % 9) + 1}`);
  }
  assert.deepEqual(WORD_PUZZLE_POSTERS.map((poster) => poster.location), [
    'Reception', 'Reception', 'Pantry area', 'Pantry area', 'Near IT Helpdesk printer',
    'Near Townhall area', 'Phase 2 cafeteria', 'Phase 2 cafeteria', 'Phase 2 cafeteria',
  ]);
});

function fakeFirestore(numbers = [1, 9, 10]) {
  const writes = [];
  const firestore = {
    collection: () => ({ get: async () => ({ docs: numbers.map((number, index) => ({
      id: `team-${index}`, get: () => number,
    })) }) }),
    doc: (path) => path,
    getAll: async (...paths) => paths.map((path) => ({
      exists: true, ref: { path }, get: (key) => writes.findLast((write) => write.path === path).data[key],
    })),
    batch: () => ({
      set: (path, data, options) => writes.push({ path, data, options }),
      commit: async () => {},
    }),
  };
  return { firestore, writes };
}

test('targeted provisioning is dry-run by default and touches only puzzle IV content', async () => {
  const { firestore, writes } = fakeFirestore();
  await provisionWordPuzzles(firestore, false);
  assert.equal(writes.length, 0);
  await provisionWordPuzzles(firestore, true);
  assert.equal(writes.length, 17);
  for (const write of writes) {
    assert.equal(write.options.merge, true);
    assert.match(write.path, /^(teamPuzzleContent\/team-\d_4|teams\/team-\d\/puzzleHints\/4_[123]|teams\/team-\d\/puzzleRewards\/4|privatePuzzles\/4|checkpoints\/[a-f0-9]{64})$/);
    assert.equal('unlockAt' in write.data, false);
  }
  assert.equal(writes.find((write) => write.path === 'teamPuzzleContent/team-1_4').data.blocks.at(-1).text.includes('poster 9'), true);
});

test('invalid or duplicate roster numbers abort before writing', async () => {
  for (const numbers of [[1, undefined], [1, 1], [0], [-1], [1.5], []]) {
    const { firestore, writes } = fakeFirestore(numbers);
    await assert.rejects(() => provisionWordPuzzles(firestore, true), /team number|No teams/);
    assert.equal(writes.length, 0);
  }
});
