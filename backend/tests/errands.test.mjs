import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ERRAND_GROUPS, ERRAND_LOCATIONS, CHECKPOINTS, errandGroup, protectedPuzzle } from '../src/content/protected.ts';
import { PUBLIC_PUZZLES } from '../src/content/public.ts';
import { provisionErrands } from '../src/scripts/provision-errands.ts';

test('six distinct Errand codes, riddles, locations and checkpoints cycle consistently', () => {
  assert.deepEqual(ERRAND_GROUPS, ['A', 'B', 'C', 'D', 'E', 'F']);
  const secret = protectedPuzzle(2);
  const puzzle = PUBLIC_PUZZLES.find((p) => p.id === 2);
  assert.equal(new Set(Object.values(secret.answersByGroup).flat()).size, 6);
  for (let number = 1; number <= 18; number++) {
    const group = errandGroup(number);
    assert.equal(group, ERRAND_GROUPS[(number - 1) % 6]);
    assert.ok(puzzle.variants[group].length);
    assert.ok(ERRAND_LOCATIONS[group]);
    assert.ok(CHECKPOINTS.some((c) => c.puzzleId === 2 && c.code === secret.answersByGroup[group][0]));
  }
  assert.deepEqual(Object.values(secret.answersByGroup).slice(0, 3), [['GLOW-7K4M'], ['GLOW-2P9X'], ['GLOW-5T3R']]);
});

test('targeted Errand provisioning is dry-run safe and preserves unrelated fields', async () => {
  const writes = [];
  const firestore = {
    collection: () => ({ get: async () => ({ docs: Array.from({ length: 6 }, (_, index) => ({
      id: `t${index + 1}`, get: () => index + 1,
    })) }) }),
    doc: (path) => path,
    getAll: async (...paths) => paths.map((path) => ({
      exists: true, ref: { path }, get: (key) => writes.findLast((w) => w.path === path).data[key],
    })),
    batch: () => ({
      set: (path, data, options) => writes.push({ path, data, options }),
      commit: async () => {},
    }),
  };
  await provisionErrands(firestore, false);
  assert.equal(writes.length, 0);
  await provisionErrands(firestore, true);
  assert.equal(writes.length, 43);
  for (const { path, data, options } of writes) {
    assert.equal(options.merge, true);
    assert.match(path, /^(teams\/t[1-6](\/puzzleHints\/2_[123])?|privateTeamData\/t[1-6]|teamPuzzleContent\/t[1-6]_2|privatePuzzles\/2|checkpoints\/[a-f0-9]{64})$/);
    assert.equal('unlockAt' in data, false);
    if (/^teams\/t\d$/.test(path)) assert.deepEqual(Object.keys(data), ['errandGroup']);
    if (path.startsWith('privateTeamData/')) assert.deepEqual(Object.keys(data).sort(), ['errandGroup', 'errandLocation']);
  }
  assert.equal(writes.find((w) => w.path === 'teams/t6').data.errandGroup, 'F');
});
