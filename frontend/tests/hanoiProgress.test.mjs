import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as hanoi from '../src/services/hanoi.ts';

const require = createRequire(import.meta.url);
const source = ts.transpileModule(readFileSync(new URL('../src/services/hanoiProgress.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function fixture() {
  const documents = new Map();
  const writes = [];
  let failure = false;
  const snapshot = (ref) => ({
    exists: () => documents.has(ref),
    get: (field) => documents.get(ref)?.[field],
  });
  const sdk = {
    doc: (_db, ...segments) => segments.join('/'),
    serverTimestamp: () => 'server-time',
    getDocFromServer: async (ref) => {
      if (failure) throw new Error('Network unavailable');
      return snapshot(ref);
    },
    runTransaction: async (_db, callback) => {
      if (failure) throw new Error('Network unavailable');
      return callback({
        get: async (ref) => snapshot(ref),
        set: (ref, data, options) => {
          assert.equal(options?.merge, true, 'draft writes must preserve hints and other progress');
          writes.push({ ref, data });
          documents.set(ref, { ...documents.get(ref), ...data });
        },
      });
    },
  };
  function service() {
    const exports = {};
    runInNewContext(source, {
      exports,
      require: (name) => {
        if (name === 'firebase/firestore') return sdk;
        if (name === './authService') return { initializeSession: async () => ({ uid: 'test' }) };
        if (name === './firebase') return { requireFirebaseServices: () => ({ firestore: {} }) };
        if (name === './hanoi') return hanoi;
        return require(name);
      },
    });
    return exports;
  }
  return { service, documents, writes, fail: () => { failure = true; } };
}

test('every move and restart survives a fresh service instance, preserving team progress', async () => {
  const f = fixture();
  const ref = 'teams/team-a/progress/8';
  const first = f.service();
  let draft = await first.loadHanoiProgress('team-a');
  assert.equal(draft.moves, '');
  assert.equal(draft.disks, 6);
  draft = await first.saveHanoiProgress('team-a', draft, '01');
  assert.equal(draft.revision, 1);
  assert.equal(f.documents.get(ref).status, 'in_progress');
  assert.equal(f.documents.get(ref).hintsUsed, 0);
  assert.equal(f.documents.get(ref).startedAt, 'server-time');
  f.documents.set(ref, { ...f.documents.get(ref), hintsUsed: 2, startedAt: 'original', extra: 'preserve' });
  const restored = await f.service().loadHanoiProgress('team-a');
  assert.equal(restored.moves, '01');
  draft = await first.saveHanoiProgress('team-a', restored, '0102');
  assert.equal(draft.revision, 2);
  draft = await first.saveHanoiProgress('team-a', draft, '');
  assert.equal(draft.revision, 3);
  assert.equal((await f.service().loadHanoiProgress('team-a')).moves, '');
  assert.equal(f.documents.get(ref).hintsUsed, 2);
  assert.equal(f.documents.get(ref).startedAt, 'original');
  assert.equal(f.documents.get(ref).extra, 'preserve');
  assert.equal((await first.loadHanoiProgress('team-b')).moves, '', 'team drafts are isolated');
});

test('stale tabs, including moves made before a restart, cannot overwrite newer tower state', async () => {
  const f = fixture();
  const service = f.service();
  const stale = await service.loadHanoiProgress('a');
  let current = await service.saveHanoiProgress('a', stale, '01');
  await assert.rejects(service.saveHanoiProgress('a', stale, '02'), /another tab or device/);
  current = await service.saveHanoiProgress('a', current, '');
  await assert.rejects(service.saveHanoiProgress('a', stale, '02'), /another tab or device/);
  assert.equal((await service.loadHanoiProgress('a')).revision, current.revision);
  assert.equal(f.writes.length, 2);
});

test('malformed drafts and illegal or multi-move writes fail without replacing saved progress', async () => {
  const f = fixture();
  const service = f.service();
  const empty = await service.loadHanoiProgress('a');
  for (const moves of ['00', '10', '0101', '0102']) {
    await assert.rejects(service.saveHanoiProgress('a', empty, moves));
  }
  for (const invalid of [null, {}, { ...empty, revision: 1, disks: 7 }, { ...empty, revision: -1 },
    { ...empty, revision: 1.5 }, { ...empty, revision: 1, version: 2 }, { ...empty, revision: 1, moves: '00' }]) {
    f.documents.set('teams/a/progress/8', { hanoiDraft: invalid });
    await assert.rejects(service.loadHanoiProgress('a'));
    await assert.rejects(service.saveHanoiProgress('a', empty, '01'));
  }
  assert.equal(f.writes.length, 0);
});

test('network failures are explicit and a solved Vault cannot be replaced with a draft', async () => {
  const f = fixture();
  const service = f.service();
  const empty = await service.loadHanoiProgress('a');
  f.documents.set('teams/a/progress/8', { status: 'solved', hintsUsed: 3 });
  await assert.rejects(service.loadHanoiProgress('a'), /already open/);
  await assert.rejects(service.saveHanoiProgress('a', empty, '01'), /already open/);
  f.fail();
  await assert.rejects(service.loadHanoiProgress('a'), /Network unavailable/);
  await assert.rejects(service.saveHanoiProgress('a', empty, '01'), /Network unavailable/);
  assert.equal(f.writes.length, 0);
});

test('a completed 63-move tower is restored ready for the final form', async () => {
  const f = fixture();
  const service = f.service();
  const solve = (n, from = 0, to = 2, spare = 1) => n
    ? solve(n - 1, from, spare, to) + `${from}${to}` + solve(n - 1, spare, to, from) : '';
  const moves = solve(6);
  let draft = await service.loadHanoiProgress('a');
  for (let i = 2; i <= moves.length; i += 2) {
    draft = await service.saveHanoiProgress('a', draft, moves.slice(0, i));
  }
  const restored = await f.service().loadHanoiProgress('a');
  assert.equal(restored.moves, moves);
  assert.equal(restored.revision, 63);
  assert.equal(hanoi.hanoiSolved(restored.moves), true);
});
