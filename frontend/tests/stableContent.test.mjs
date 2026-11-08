import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = ts.transpileModule(readFileSync(new URL('../src/services/stableContent.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function fixture() {
  let now = 0;
  let calls = 0;
  let fail = false;
  let exists = true;
  let finish;
  let wait = null;
  class Clock extends Date { static now() { return now; } }
  const exports = {};
  runInNewContext(source, {
    exports, Date: Clock, Error,
    require: () => ({ readDocument: async (ref) => {
      calls++;
      if (wait) await wait;
      if (fail) throw new Error('Offline');
      return { exists: () => exists, path: ref.path };
    } }),
  });
  const firestore = {};
  return {
    ...exports, ref: (path, db = firestore) => ({ path, firestore: db }),
    calls: () => calls,
    advance: (ms) => { now += ms; },
    fail: (value) => { fail = value; }, exists: (value) => { exists = value; },
    hold() { wait = new Promise((resolve) => { finish = resolve; }); },
    release() { wait = null; finish(); },
  };
}

test('puzzle and dashboard reuse content, hints and all eight earned rewards with exact read savings', async () => {
  const f = fixture();
  for (let refresh = 0; refresh < 5; refresh++) {
    for (let id = 1; id <= 8; id++) await f.readStableContent(f.ref(`teams/TEAM-001/puzzleRewards/${id}`));
  }
  assert.equal(f.calls(), 8, 'five dashboard refreshes read eight rewards, not forty');
  for (let revisit = 0; revisit < 3; revisit++) {
    await f.readStableContent(f.ref('teamPuzzleContent/TEAM-001_3'));
    await f.readStableContent(f.ref('teams/TEAM-001/puzzleHints/3_1'));
  }
  assert.equal(f.calls(), 10, 'revisiting puzzle text and a revealed hint adds only two reads');
  await f.readStableContent(f.ref('teamPuzzleContent/TEAM-002_3'));
  await f.readStableContent(f.ref('teamPuzzleContent/TEAM-001_3', {}));
  assert.equal(f.calls(), 12, 'different teams and Firestore instances never share content');
});

test('concurrent reads deduplicate even beyond TTL while still pending; cached content expires after resolution', async () => {
  const f = fixture();
  const ref = f.ref('teamPuzzleContent/TEAM-001_3');
  f.hold();
  const first = f.readStableContent(ref);
  f.advance(600_000);
  const second = f.readStableContent(ref);
  assert.equal(first, second);
  assert.equal(f.calls(), 1);
  f.release();
  await first;
  f.advance(299_999);
  await f.readStableContent(ref);
  assert.equal(f.calls(), 1);
  f.advance(1);
  await f.readStableContent(ref);
  assert.equal(f.calls(), 2);
  f.clearStableContent();
  await f.readStableContent(ref);
  assert.equal(f.calls(), 3);
});

test('failed and missing content is retried rather than poisoning the cache', async () => {
  const f = fixture();
  const ref = f.ref('teamPuzzleContent/TEAM-001_3');
  f.fail(true);
  await assert.rejects(f.readStableContent(ref), /Offline/);
  f.fail(false); f.exists(false);
  assert.equal((await f.readStableContent(ref)).exists(), false);
  f.exists(true);
  assert.equal((await f.readStableContent(ref)).exists(), true);
  await f.readStableContent(ref);
  assert.equal(f.calls(), 3);
});

test('mutable progress, releases, identity and answer documents cannot use the content cache', () => {
  const f = fixture();
  for (const path of ['teams/TEAM-001', 'teams/TEAM-001/progress/3', 'gameConfig/main',
    'puzzles/9', 'privatePuzzles/3', 'teamKeyClaims/hash', 'teams/TEAM-001/convergence/arrival']) {
    assert.throws(() => f.readStableContent(f.ref(path)), /Only provisioned/);
  }
  assert.equal(f.calls(), 0);
});

test('shared public metadata is reused but explicit cache invalidation reloads it', async () => {
  const f = fixture();
  for (let pass = 0; pass < 3; pass++) {
    for (let id = 1; id <= 8; id++) await f.readStableContent(f.ref(`puzzles/${id}`));
  }
  assert.equal(f.calls(), 8);
  f.clearStableContent();
  await f.readStableContent(f.ref('puzzles/3'));
  assert.equal(f.calls(), 9);
});
