import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as hanoi from '../src/services/hanoi.ts';

const source = ts.transpileModule(readFileSync(new URL('../src/services/hanoiQueue.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const tick = () => new Promise((resolve) => setImmediate(resolve));
const initial = () => ({ version: 1, disks: 6, revision: 0, moves: '' });

function fixture() {
  const storage = new Map();
  const database = new Map();
  const timers = [];
  const calls = [];
  const errors = [];
  let reads = 0;
  let saveError = false;
  let storageError = false;
  let waitForSave = null;
  const sessionStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => {
      if (storageError) throw new Error('Storage disabled');
      storage.set(key, value);
    },
    removeItem: (key) => storage.delete(key),
  };
  const progress = {
    parseHanoiDraft: (value) => {
      assert.equal(value.version, 1);
      assert.equal(value.disks, 6);
      hanoi.hanoiPegs(value.moves);
      return value;
    },
    loadHanoiProgress: async (team) => { reads++; return database.get(team) ?? initial(); },
    saveHanoiProgress: async (team, moves) => {
      calls.push({ team, moves });
      if (waitForSave) await waitForSave;
      if (saveError) throw new Error('Offline');
      const draft = { ...initial(), revision: (database.get(team)?.revision ?? 0) + 1, moves };
      database.set(team, draft);
      return draft;
    },
  };
  function service() {
    const exports = {};
    runInNewContext(source, {
      exports, Error, sessionStorage,
      setInterval: (callback, interval) => {
        assert.equal(interval, 15_000);
        const timer = { callback, active: true };
        timers.push(timer);
        return timer;
      },
      clearInterval: (timer) => { timer.active = false; },
      console: { error: (...args) => errors.push(args) },
      require: (name) => {
        if (name === './hanoi') return hanoi;
        if (name === './hanoiProgress') return progress;
        throw new Error(`Unexpected dependency ${name}`);
      },
    });
    return exports;
  }
  return {
    service, storage, database, calls, errors, timers,
    reads: () => reads,
    advance: async () => { timers.filter((timer) => timer.active).forEach((timer) => timer.callback()); await tick(); },
    offline: (value) => { saveError = value; },
    blockStorage: (value) => { storageError = value; },
    holdSave: () => {
      let release;
      waitForSave = new Promise((resolve) => { release = resolve; });
      return () => { waitForSave = null; release(); };
    },
  };
}

function observe(queue) {
  let state;
  const unsubscribe = queue.subscribe((next) => { state = next; });
  return { current: () => state, unsubscribe };
}

test('moves update immediately, zero per-move writes, one batch per 15-second tick, no idle traffic', async () => {
  const f = fixture();
  const queue = await f.service().getHanoiQueue('a');
  const state = observe(queue);
  queue.enqueue('01');
  queue.enqueue('0102');
  queue.enqueue('010212');
  assert.equal(state.current().moves, '010212');
  assert.equal(f.calls.length, 0);
  assert.equal(JSON.parse(f.storage.get('lostlight.hanoi.a')).pending.join(','), '01,02,12');
  await f.advance();
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].moves, '010212');
  assert.equal(state.current().pending, 0);
  await f.advance();
  await f.advance();
  assert.equal(f.calls.length, 1);
  assert.equal(f.reads(), 1);
});

test('reload restores unsynced operations and restarts locally without reading the database', async () => {
  const f = fixture();
  const queue = await f.service().getHanoiQueue('a');
  queue.enqueue('01');
  queue.enqueue('');
  queue.enqueue('02');
  const restored = await f.service().getHanoiQueue('a');
  assert.equal(observe(restored).current().moves, '02');
  assert.equal(f.reads(), 1);
  await restored.flush();
  assert.equal(f.calls[0].moves, '02');
  const reloaded = await f.service().getHanoiQueue('a');
  assert.equal(observe(reloaded).current().moves, '02');
  assert.equal(observe(reloaded).current().pending, 0);
});

test('new moves during a slow sync remain queued and never start an overlapping transaction', async () => {
  const f = fixture();
  const queue = await f.service().getHanoiQueue('a');
  queue.enqueue('01');
  const release = f.holdSave();
  const pending = queue.flush();
  await f.advance();
  queue.enqueue('0102');
  queue.enqueue('');
  queue.enqueue('02');
  assert.equal(f.calls.length, 1);
  release();
  await pending;
  assert.equal(observe(queue).current().moves, '02');
  assert.equal(observe(queue).current().pending, 3);
  await f.advance();
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[1].moves, '02');
  assert.equal(observe(queue).current().pending, 0);
});

test('offline batches retain their queue, allow play, log failure, and retry on the next tick', async () => {
  const f = fixture();
  const queue = await f.service().getHanoiQueue('a');
  queue.enqueue('01');
  f.offline(true);
  await f.advance();
  assert.equal(observe(queue).current().pending, 1);
  assert.equal(f.errors.length, 1);
  queue.enqueue('0102');
  f.offline(false);
  await f.advance();
  assert.equal(f.calls[1].moves, '0102');
  assert.equal(observe(queue).current().pending, 0);
  assert.equal(observe(queue).current().syncError, null);
});

test('queue is team-specific, continues after page unsubscribe, and final submission drains it before clearing', async () => {
  const f = fixture();
  const service = f.service();
  const queue = await service.getHanoiQueue('a');
  assert.equal(await service.getHanoiQueue('a'), queue, 'only one worker per team');
  const other = await service.getHanoiQueue('b');
  assert.equal(observe(other).current().moves, '');
  const observer = observe(queue);
  queue.enqueue('01');
  observer.unsubscribe();
  await f.advance();
  assert.equal(f.database.get('a').moves, '01');
  queue.enqueue('0102');
  await queue.finishSync();
  assert.equal(f.database.get('a').moves, '0102');
  queue.clear();
  assert.equal(f.storage.has('lostlight.hanoi.a'), false);
  assert.equal(f.timers[0].active, false);
});

test('storage failure blocks an unsaved move, preserves prior queue, and can be retried', async () => {
  const f = fixture();
  const queue = await f.service().getHanoiQueue('a');
  queue.enqueue('01');
  f.blockStorage(true);
  assert.throws(() => queue.enqueue('0102'), /Cannot save/);
  assert.equal(observe(queue).current().moves, '01');
  assert.equal(JSON.parse(f.storage.get('lostlight.hanoi.a')).pending.length, 1);
  f.blockStorage(false);
  queue.retryStorage();
  assert.equal(observe(queue).current().storageError, null);
  queue.enqueue('0102');
  await queue.flush();
  assert.equal(f.calls[0].moves, '0102');
});

test('a failed local acknowledgement retains the entire batch for safe reload and retry', async () => {
  const f = fixture();
  const queue = await f.service().getHanoiQueue('a');
  queue.enqueue('01');
  const release = f.holdSave();
  const sync = queue.flush();
  queue.enqueue('0102');
  f.blockStorage(true);
  release();
  await assert.rejects(sync, /Cannot save/);
  assert.equal(f.database.get('a').moves, '01');
  assert.equal(observe(queue).current().pending, 2);
  f.blockStorage(false);
  const restored = await f.service().getHanoiQueue('a');
  assert.equal(observe(restored).current().moves, '0102');
  await restored.flush();
  assert.equal(f.database.get('a').moves, '0102');
  assert.equal(observe(restored).current().pending, 0);
});

test('malformed local queues and illegal moves fail explicitly without replacement or writes', async () => {
  const f = fixture();
  f.storage.set('lostlight.hanoi.a', '{"draft":{},"pending":[]}');
  await assert.rejects(f.service().getHanoiQueue('a'));
  assert.equal(f.storage.get('lostlight.hanoi.a'), '{"draft":{},"pending":[]}');
  const queue = await f.service().getHanoiQueue('b');
  assert.throws(() => queue.enqueue('00'));
  assert.throws(() => queue.enqueue('0102'), /one legal move/);
  assert.equal(f.calls.length, 0);
});
