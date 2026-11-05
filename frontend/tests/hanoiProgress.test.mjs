import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as hanoi from '../src/services/hanoi.ts';
import { GAMEPLAY_RUN } from '../src/services/gameplayRun.ts';

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
    get: (field) => field === 'progressRunId' && /^teams\/[^/]+$/.test(ref)
      ? documents.get(ref)?.progressRunId ?? GAMEPLAY_RUN : documents.get(ref)?.[field],
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
        if (name === './gameplayRun') return { GAMEPLAY_RUN };
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
  draft = await first.saveHanoiProgress('team-a', '01');
  assert.equal(draft.revision, 1);
  assert.equal(f.documents.get(ref).status, 'in_progress');
  assert.equal(f.documents.get(ref).hintsUsed, 0);
  assert.equal(f.documents.get(ref).startedAt, 'server-time');
  f.documents.set(ref, { ...f.documents.get(ref), hintsUsed: 2, startedAt: 'original', extra: 'preserve' });
  const restored = await f.service().loadHanoiProgress('team-a');
  assert.equal(restored.moves, '01');
  draft = await first.saveHanoiProgress('team-a', '0102');
  assert.equal(draft.revision, 2);
  draft = await first.saveHanoiProgress('team-a', '');
  assert.equal(draft.revision, 3);
  assert.equal((await f.service().loadHanoiProgress('team-a')).moves, '');
  assert.equal(f.documents.get(ref).hintsUsed, 2);
  assert.equal(f.documents.get(ref).startedAt, 'original');
  assert.equal(f.documents.get(ref).extra, 'preserve');
  assert.equal((await first.loadHanoiProgress('team-b')).moves, '', 'team drafts are isolated');
});

test('one batch can contain multiple moves and the latest active-device batch replaces the saved tower', async () => {
  const f = fixture();
  const service = f.service();
  let current = await service.saveHanoiProgress('a', '0102');
  assert.equal(current.moves, '0102');
  current = await service.saveHanoiProgress('a', '');
  current = await service.saveHanoiProgress('a', '02');
  assert.equal((await service.loadHanoiProgress('a')).revision, current.revision);
  assert.equal(f.writes.length, 3);
});

test('malformed drafts and illegal batch histories fail without replacing saved progress', async () => {
  const f = fixture();
  const service = f.service();
  for (const moves of ['00', '10', '0101']) {
    await assert.rejects(service.saveHanoiProgress('a', moves));
  }
  const empty = await service.loadHanoiProgress('a');
  for (const invalid of [null, {}, { ...empty, revision: 1, disks: 7 }, { ...empty, revision: -1 },
    { ...empty, revision: 1.5 }, { ...empty, revision: 1, version: 2 }, { ...empty, revision: 1, moves: '00' }]) {
    f.documents.set('teams/a/progress/8', { hanoiDraft: invalid });
    await assert.rejects(service.loadHanoiProgress('a'));
    await assert.rejects(service.saveHanoiProgress('a', '01'));
  }
  assert.equal(f.writes.length, 0);
});

test('network failures are explicit and a solved Vault cannot be replaced with a draft', async () => {
  const f = fixture();
  const service = f.service();
  f.documents.set('teams/a/progress/8', { status: 'solved', hintsUsed: 3 });
  await assert.rejects(service.loadHanoiProgress('a'), /already open/);
  await assert.rejects(service.saveHanoiProgress('a', '01'), /already open/);
  f.fail();
  await assert.rejects(service.loadHanoiProgress('a'), /Network unavailable/);
  await assert.rejects(service.saveHanoiProgress('a', '01'), /Network unavailable/);
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
    draft = await service.saveHanoiProgress('a', moves.slice(0, i));
  }
  const restored = await f.service().loadHanoiProgress('a');
  assert.equal(restored.moves, moves);
  assert.equal(restored.revision, 63);
  assert.equal(hanoi.hanoiSolved(restored.moves), true);
});

test('a queue from a different gameplay run cannot repopulate reset progress', async () => {
  const f = fixture();
  f.documents.set('teams/a', { progressRunId: 'different-run' });
  await assert.rejects(f.service().saveHanoiProgress('a', '01'), /game has been reset/);
  assert.equal(f.writes.length, 0);
});
