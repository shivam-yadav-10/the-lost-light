import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { GAMEPLAY_RUN } from '../src/services/gameplayRun.ts';

const compile = (file) => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function fixture() {
  const storage = new Map();
  const warnings = [];
  let reads = 0;
  let blocked = false;
  let wait = null;
  let release;
  let run = GAMEPLAY_RUN;
  class Timestamp {
    constructor(seconds, nanoseconds) {
      assert.ok(Number.isInteger(seconds) && Number.isInteger(nanoseconds) && nanoseconds >= 0 && nanoseconds < 1e9);
      this.seconds = seconds; this.nanoseconds = nanoseconds;
    }
    toDate() { return new Date(this.seconds * 1000 + this.nanoseconds / 1e6); }
  }
  const sessionStorage = {
    get length() { return storage.size; },
    key: (index) => [...storage.keys()][index] ?? null,
    getItem(key) { if (blocked) throw new Error('Storage disabled'); return storage.get(key) ?? null; },
    setItem(key, value) { if (blocked) throw new Error('Storage disabled'); storage.set(key, value); },
    removeItem(key) { if (blocked) throw new Error('Storage disabled'); storage.delete(key); },
  };
  const firestore = { app: { options: { projectId: 'fixture-project' } } };
  const ref = (path, db = firestore) => ({ path, id: path.split('/').at(-1), firestore: db });
  const data = {
    unlockAt: new Timestamp(1794295800, 123456789),
    nested: { values: [null, true, 'fixture', 42, { type: 'timestamp', seconds: 'ordinary content' }] },
  };
  function load() {
    const gameplayRun = {};
    runInNewContext(compile('../src/services/gameplayRun.ts'), {
      exports: gameplayRun, sessionStorage, console: { warn: (...args) => warnings.push(args) },
    });
    const session = {};
    runInNewContext(compile('../src/services/sessionContent.ts'), {
      exports: session, Object, Array, JSON, Error, sessionStorage,
      console: { warn: (...args) => warnings.push(args) },
      require: (name) => name === 'firebase/firestore' ? { Timestamp } : { ...gameplayRun, GAMEPLAY_RUN: run },
    });
    const stable = {};
    runInNewContext(compile('../src/services/stableContent.ts'), {
      exports: stable, Date, Error,
      require: (name) => {
        if (name === './sessionContent') return session;
        if (name === './firestoreReads') return {
          readDocument: async (reference) => {
            reads++;
            if (wait) await wait;
            return { id: reference.id, exists: () => true, data: () => data, get: (field) => data[field] };
          },
        };
        return {};
      },
    });
    return { ...session, ...stable };
  }
  return { load, ref, data, storage, warnings, reads: () => reads, block: (value) => { blocked = value; },
    changeRun: () => { run = 'next-event'; },
    hold() { wait = new Promise((resolve) => { release = resolve; }); },
    release() { wait = null; release(); },
  };
}

test('normal reload reuses all eight puzzle definitions and three earned rewards: eleven reads become zero', async () => {
  const f = fixture();
  const paths = [...Array.from({ length: 8 }, (_, i) => `puzzles/${i + 1}`),
    ...Array.from({ length: 3 }, (_, i) => `teams/TEAM-001/puzzleRewards/${i + 1}`)];
  const first = f.load();
  for (const path of paths) await first.readStableContent(f.ref(path), 'TEAM-001');
  assert.equal(f.reads(), 11);
  const reloaded = f.load();
  for (const path of paths) {
    const restored = await reloaded.readStableContent(f.ref(path), 'TEAM-001');
    assert.equal(restored.exists(), true);
    assert.equal(restored.id, path.split('/').at(-1));
    assert.deepEqual(restored.data(), f.data);
    assert.equal(restored.get('unlockAt').toDate().getTime(), f.data.unlockAt.toDate().getTime());
  }
  assert.equal(f.reads(), 11, 'a fresh module uses session storage, not Firestore');
  reloaded.clearStableContent();
  for (const path of paths) await reloaded.readStableContent(f.ref(path), 'TEAM-001');
  assert.equal(f.reads(), 22, 'Ctrl+Shift+R clears both caches and fetches all eleven documents');
});

test('cached content is isolated by project, event and team; mutable and private records are never persisted', async () => {
  const f = fixture();
  await f.load().readStableContent(f.ref('puzzles/1'), 'TEAM-001');
  await f.load().readStableContent(f.ref('puzzles/1'), 'TEAM-002');
  await f.load().readStableContent(f.ref('puzzles/1', { app: { options: { projectId: 'another-project' } } }), 'TEAM-001');
  f.changeRun();
  await f.load().readStableContent(f.ref('puzzles/1'), 'TEAM-001');
  assert.equal(f.reads(), 4);
  const size = f.storage.size;
  const service = f.load();
  for (const path of ['gameConfig/main', 'teams/TEAM-001', 'teams/TEAM-001/progress/1',
    'privatePuzzles/1', 'teamPuzzleContent/TEAM-001_1', 'teams/TEAM-001/puzzleHints/1_1']) {
    service.saveSessionContent(f.ref(path), f.data, 'TEAM-001');
    assert.equal(service.loadSessionContent(f.ref(path), 'TEAM-001'), null);
  }
  assert.equal(f.storage.size, size);
});

test('corrupt or unavailable session storage logs and falls back to Firebase without hiding failures', async () => {
  const f = fixture();
  await f.load().readStableContent(f.ref('puzzles/1'), 'TEAM-001');
  const key = [...f.storage.keys()][0];
  f.storage.set(key, '{broken');
  await f.load().readStableContent(f.ref('puzzles/1'), 'TEAM-001');
  assert.equal(f.reads(), 2);
  assert.equal(f.warnings.length, 1);
  f.block(true);
  await f.load().readStableContent(f.ref('puzzles/1'), 'TEAM-001');
  assert.equal(f.reads(), 3);
  assert.ok(f.warnings.length >= 3);
});

test('memory-only cleanup preserves browser reload cache; explicit clearing removes only scoped content', async () => {
  const f = fixture();
  const service = f.load();
  await service.readStableContent(f.ref('puzzles/1'), 'TEAM-001');
  f.storage.set('lostlight.hanoi.TEAM-001', 'keep');
  service.clearStableContent(false);
  await service.readStableContent(f.ref('puzzles/1'), 'TEAM-001');
  assert.equal(f.reads(), 1);
  service.clearSessionContent();
  assert.equal(f.storage.size, 1);
  assert.equal(f.storage.get('lostlight.hanoi.TEAM-001'), 'keep');
});

test('a late read cannot repopulate session storage after explicit cache clearing or logout', async () => {
  const f = fixture();
  const service = f.load();
  f.hold();
  const pending = service.readStableContent(f.ref('puzzles/1'), 'TEAM-001');
  service.clearStableContent();
  f.release();
  await pending;
  assert.equal(f.storage.size, 0);
  await f.load().readStableContent(f.ref('puzzles/1'), 'TEAM-001');
  assert.equal(f.reads(), 2, 'the next session must fetch rather than restore the discarded request');
});
