import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as rules from '../src/services/gameRules.ts';

const source = ts.transpileModule(readFileSync(new URL('../src/services/adminService.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function fixture() {
  let now = '2026-11-05T06:00:00.000Z';
  const deleted = Symbol('delete');
  const serverTime = Symbol('server');
  class Timestamp {
    constructor(value) { this.value = value; }
    toDate() { return new Date(this.value); }
    static fromDate(value) { return new Timestamp(value.toISOString()); }
  }
  const documents = new Map([
    ['gameConfig/main', {
      scheduleStartAt: rules.EVENT_START_AT,
      unlockOverrides: { '2': new Timestamp('2026-11-05T05:30:00.000Z') },
      unrelated: 'preserve',
    }],
    ['adminGameData/keeperSeals', { keeperSeals: [] }],
    ['teams/a', { teamName: 'Test team', teamNumber: 1, active: true, assignedUids: ['device'] }],
    ['adminTeamData/a', {
      teamNumber: 1, errandGroup: 'A', errandLocation: 'Office', riddleSet: 'V1', lanternKey: 'test',
    }],
    ['teams/a/progress/8', { status: 'solved', hintsUsed: 1, solvedAt: '2026-11-05T06:10:00.000Z' }],
  ]);
  for (let id = 1; id <= 8; id++) documents.set(`puzzles/${id}`, {
    id, kind: id <= 6 ? 'core' : id === 7 ? 'convergence' : 'vault',
    title: `Puzzle ${id}`, fragmentName: `Fragment ${id}`, sortOrder: id, requires: [],
    slug: `puzzle-${id}`, maxHints: 3,
    hintPenalties: [5, 10, 15], unlockAt: id <= 6 ? rules.CORE_QUESTION_SCHEDULE[id - 1].unlockAt : null,
  });
  const snapshot = (path) => ({
    id: path.split('/').at(-1),
    exists: () => documents.has(path),
    data: () => documents.get(path),
    get: (field) => documents.get(path)?.[field],
  });
  const sdk = {
    Timestamp,
    collection: (...segments) => segments.filter((value) => typeof value === 'string').join('/'),
    doc: (...segments) => segments.filter((value) => typeof value === 'string').join('/'),
    getDoc: async (path) => snapshot(path),
    getDocs: async (path) => ({
      docs: [...documents.keys()].filter((key) => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes('/')).map(snapshot),
    }),
    where: () => ({}), query: (path) => path,
    getCountFromServer: async () => ({ data: () => ({ count: 0 }) }),
    serverTimestamp: () => serverTime,
    deleteField: () => deleted,
    runTransaction: async (_db, callback) => {
      const resolve = (value) => value === serverTime ? new Timestamp(now)
        : value && typeof value === 'object' && !(value instanceof Timestamp)
          ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolve(item)])) : value;
      await callback({
        get: async (path) => snapshot(path),
        update: (path, update) => {
          const next = { ...documents.get(path) };
          for (const [field, value] of Object.entries(update)) {
            if (value === deleted) delete next[field];
            else next[field] = resolve(value);
          }
          documents.set(path, next);
        },
      });
    },
  };
  const exports = {};
  runInNewContext(source, {
    exports, Error,
    require: (name) => {
      if (name === 'firebase/firestore') return sdk;
      if (name === 'firebase/auth') return {};
      if (name === 'firebase/app') return { FirebaseError: class extends Error {} };
      if (name === './firebase') return { requireAdminFirebaseServices: () => ({ firestore: {} }) };
      if (name === './gameRules') return rules;
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  const playerExports = {};
  const playerSource = ts.transpileModule(readFileSync(new URL('../src/services/progressService.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(playerSource, {
    exports: playerExports, Error,
    require: (name) => {
      if (name === 'firebase/firestore') return sdk;
      if (name === 'firebase/app') return { FirebaseError: class extends Error {} };
      if (name === './authService') return { initializeSession: async () => ({ uid: 'device' }) };
      if (name === './firebase') return {
        requireFirebaseServices: () => ({ firestore: {} }), GameServicesUnavailableError: class extends Error {},
      };
      if (name === './teamService') return { TeamLoginError: class extends Error {} };
      if (name === './stableContent') return { readStableContent: sdk.getDoc };
      if (name === './gameRules') return rules;
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  return { service: exports, player: playerExports, documents, setNow: (value) => { now = value; } };
}

test('Question 1 manual unlock starts a server-timed shared score; re-lock/unlock resets it without touching progress', async () => {
  const f = fixture();
  const before = JSON.stringify(f.documents.get('teams/a/progress/8'));
  let overview = await f.service.getAdminOverview();
  assert.equal(overview.testScoringActive, false);
  assert.equal(overview.scheduleStartAt, rules.EVENT_START_AT);
  overview = await f.service.setPuzzleUnlockOverride(1, true);
  assert.equal(overview.testScoringActive, true);
  assert.equal(overview.scheduleStartAt, '2026-11-05T06:00:00.000Z');
  assert.equal(overview.teams[0].elapsedMs, 10 * 60_000);
  assert.equal(overview.teams[0].adjustedElapsedMs, 15 * 60_000);
  let player = await f.player.getTeamProgress('a', 1);
  assert.equal(player.scheduleStartAt, overview.scheduleStartAt);
  assert.equal(player.adjustedElapsedMs, overview.teams[0].adjustedElapsedMs);
  const config = f.documents.get('gameConfig/main');
  assert.equal(config.unlockOverrides['1'].toDate().toISOString(), overview.scheduleStartAt);
  assert.equal(config.unlockOverrides['2'].toDate().toISOString(), '2026-11-05T05:30:00.000Z');
  assert.equal(config.unrelated, 'preserve');
  f.setNow('2026-11-05T06:05:00.000Z');
  overview = await f.service.setPuzzleUnlockOverride(2, true);
  assert.equal(overview.scheduleStartAt, '2026-11-05T06:00:00.000Z', 'other unlocks do not restart scoring');
  overview = await f.service.setPuzzleUnlockOverride(1, false);
  assert.equal(overview.testScoringActive, false);
  assert.equal(overview.scheduleStartAt, rules.EVENT_START_AT);
  assert.equal(f.documents.get('gameConfig/main').testScoringStartAt, undefined);
  overview = await f.service.setPuzzleUnlockOverride(1, true);
  assert.equal(overview.scheduleStartAt, '2026-11-05T06:05:00.000Z');
  assert.equal(overview.teams[0].elapsedMs, 5 * 60_000);
  assert.equal(overview.teams[0].adjustedElapsedMs, 10 * 60_000);
  player = await f.player.getTeamProgress('a', 1);
  assert.equal(player.scheduleStartAt, overview.scheduleStartAt);
  assert.equal(player.adjustedElapsedMs, overview.teams[0].adjustedElapsedMs);
  assert.equal(JSON.stringify(f.documents.get('teams/a/progress/8')), before);
  assert.equal(f.documents.get('gameConfig/main').scheduleStartAt, rules.EVENT_START_AT);
});

test('invalid endgame manual unlock does not start or overwrite the scoring clock', async () => {
  const f = fixture();
  await assert.rejects(f.service.setPuzzleUnlockOverride(7, true), /Only core fragments/);
  assert.equal(f.documents.get('gameConfig/main').testScoringStartAt, undefined);
});
