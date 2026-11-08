import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as path from 'node:path';
import * as util from 'node:util';
import { z } from 'zod';
import ts from 'typescript';

const source = ts.transpileModule(
  readFileSync(new URL('../src/scripts/migrate-hint-usage.ts', import.meta.url), 'utf8')
    .replace('import.meta.dirname', '__dirname'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

function fixture() {
  const run = 'fixture-run';
  const data = new Map([['gameConfig/main', { progressRunId: run, scheduleStartAt: 'unchanged' }]]);
  for (let index = 1; index <= 12; index++) {
    const id = `TEAM-${String(index).padStart(3, '0')}`;
    data.set(`teams/${id}`, { active: true, teamNumber: index, progressRunId: run, teamName: 'Preserved', assignedUids: ['device'] });
  }
  data.set('teams/TEAM-001/progress/1', { hintsUsed: 2, status: 'solved', solvedAt: 'unchanged' });
  const writes = [];
  const backups = [];
  let changeBeforeTransaction = () => {};
  const snapshot = (ref) => {
    const value = structuredClone(data.get(ref.path));
    return { ref, id: ref.path.split('/').at(-1), exists: value !== undefined,
      data: () => value, get: (key) => value?.[key], updateTime: value === undefined ? undefined : 1 };
  };
  const db = {
    doc: (name) => ({ path: name }),
    getAll: async (...refs) => refs.map(snapshot),
    runTransaction: async (callback) => {
      changeBeforeTransaction();
      const pending = [];
      await callback({
        getAll: async (...refs) => {
          assert.equal(pending.length, 0);
          return refs.map(snapshot);
        },
        update: (ref, value) => pending.push([ref, value]),
      });
      for (const [ref, value] of pending) {
        writes.push(ref.path);
        data.set(ref.path, { ...data.get(ref.path), ...value });
      }
    },
  };
  const modules = {
    'firebase-admin/app': { applicationDefault() {}, initializeApp() {}, async deleteApp() {} },
    'firebase-admin/firestore': { getFirestore: () => db },
    'node:fs': { writeFileSync: (location, contents, options) => {
      assert.equal(options.flag, 'wx');
      backups.push(JSON.parse(contents));
    } },
    'node:path': path, 'node:util': util, zod: { z },
  };
  const execute = async (apply = false) => new AsyncFunction('require', 'exports', 'process', 'console', '__dirname', source)(
    (name) => modules[name], {}, { argv: ['node', 'script', '--run', run,
      ...(apply ? ['--apply', '--backup', path.resolve(path.parse(process.cwd()).root, 'private', 'hint-backup.json')] : [])] },
    { log() {} }, path.resolve('src', 'scripts'),
  );
  return { data, writes, backups, execute, run, change: (callback) => { changeBeforeTransaction = callback; } };
}

test('dry migration preserves everything and does not write a backup', async () => {
  const f = fixture();
  await f.execute();
  assert.equal(f.writes.length, 0);
  assert.equal(f.backups.length, 0);
});

test('migration adds only counters, preserves used hints and is idempotent', async () => {
  const f = fixture();
  const original = structuredClone(f.data);
  await f.execute(true);
  assert.equal(f.writes.length, 12);
  assert.equal(f.backups[0].length, 109);
  for (const [location, saved] of original) {
    const current = { ...f.data.get(location) };
    if (/^teams\/TEAM-\d+$/.test(location)) {
      assert.equal(current.hintUsage.runId, f.run);
      assert.equal(current.hintUsage.counts['1'], location === 'teams/TEAM-001' ? 2 : 0);
      delete current.hintUsage;
    }
    assert.deepEqual(current, saved);
  }
  f.writes.length = 0;
  await f.execute(true);
  assert.equal(f.writes.length, 0);
});

test('migration rejects bad runs, invalid progress and mismatched existing counters before writing', async () => {
  for (const edit of [
    (f) => { f.data.get('gameConfig/main').progressRunId = 'old'; },
    (f) => { f.data.get('teams/TEAM-001/progress/1').hintsUsed = 4; },
    (f) => { f.data.get('teams/TEAM-001').hintUsage = { runId: f.run, counts: {} }; },
    (f) => { f.data.get('teams/TEAM-001').teamNumber = 99; },
  ]) {
    const f = fixture();
    edit(f);
    await assert.rejects(f.execute(true));
    assert.equal(f.writes.length, 0);
    assert.equal(f.backups.length, 0);
  }
});

test('migration aborts atomically if progress changes after the backup', async () => {
  const f = fixture();
  f.change(() => { f.data.get('teams/TEAM-001/progress/1').hintsUsed = 3; });
  await assert.rejects(f.execute(true), /Data changed/);
  assert.equal(f.writes.length, 0);
  assert.equal(f.backups.length, 1);
});
