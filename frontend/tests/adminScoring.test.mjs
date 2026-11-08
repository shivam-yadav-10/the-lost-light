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
  const reads = [];
  const firestore = {};
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
    collection: (...segments) => segments.map((value) => typeof value === 'string' ? value : value.path).filter(Boolean).join('/'),
    doc: (...segments) => {
      const path = segments.map((value) => typeof value === 'string' ? value : value.path).filter(Boolean).join('/');
      return { path, id: path.split('/').at(-1) };
    },
    getDoc: async (ref) => {
      const path = typeof ref === 'string' ? ref : ref.path;
      reads.push({ path, type: 'document' });
      return snapshot(path);
    },
    getDocs: async (path) => {
      reads.push({ path, type: 'query' });
      return { docs: [...documents.keys()].filter((key) => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes('/')).map(snapshot) };
    },
    where: () => ({}), query: (path) => path,
    getCountFromServer: async () => assert.fail('Admin must not query unused attempts'),
    serverTimestamp: () => serverTime,
    deleteField: () => deleted,
    runTransaction: async (_db, callback) => {
      const resolve = (value) => value === serverTime ? new Timestamp(now)
        : value && typeof value === 'object' && !(value instanceof Timestamp)
          ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolve(item)])) : value;
      await callback({
        get: async (ref) => {
          reads.push({ path: ref.path, type: 'transaction' });
          return snapshot(ref.path);
        },
        update: (ref, update) => {
          const path = typeof ref === 'string' ? ref : ref.path;
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
      if (name === 'firebase/auth') return { signOut: async () => {} };
      if (name === 'firebase/app') return { FirebaseError: class extends Error {} };
      if (name === './firebase') return { requireAdminFirebaseServices: () => ({ firestore, auth: {} }) };
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
      if (name === './firestoreReads') return { readDocument: sdk.getDoc, readQuery: sdk.getDocs };
      if (name === './gameRules') return rules;
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  return { service: exports, player: playerExports, documents, reads, setNow: (value) => { now = value; } };
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

test('twelve-team overview removes all legacy reads; warm manual refresh reads only live teams, progress and config', async () => {
  const f = fixture();
  for (let id = 2; id <= 12; id++) {
    f.documents.set(`teams/team${id}`, { ...f.documents.get('teams/a'), teamNumber: id, teamName: `Team ${id}` });
    f.documents.set(`adminTeamData/team${id}`, { ...f.documents.get('adminTeamData/a'), teamNumber: id });
  }
  const first = f.service.getAdminOverview();
  assert.equal(f.service.getAdminOverview(), first, 'overlapping requests share one load');
  await first;
  assert.equal(f.reads.length, 16);
  assert.ok(f.reads.every(({ path }) => !/submissions|verifiedShards|keeperSeals/.test(path)));
  f.reads.length = 0;
  f.documents.set('teams/a/progress/8', { status: 'solved', hintsUsed: 2, solvedAt: '2026-11-10T08:10:00Z' });
  f.documents.get('teams/a').lastSeenAt = '2026-11-10T08:11:00Z';
  const result = await f.service.getAdminOverview();
  assert.equal(f.reads.length, 14);
  assert.ok(f.reads.every(({ path }) => path === 'teams' || path === 'gameConfig/main' || path.endsWith('/progress')));
  const team = result.teams.find((team) => team.id === 1);
  assert.equal(team.penaltyMinutes, 15);
  assert.equal(team.lastSeenAt, '2026-11-10T08:11:00.000Z');
  await f.service.signOutAdmin();
  f.reads.length = 0;
  await f.service.getAdminOverview();
  assert.equal(f.reads.length, 16, 'sign-out clears cached organiser metadata');
});

test('release toggles use two transaction reads and a config confirmation, not a team reload', async () => {
  const f = fixture();
  await f.service.getAdminOverview();
  f.reads.length = 0;
  const result = await f.service.setPuzzleUnlockOverride(1, true);
  assert.deepEqual(f.reads, [
    { path: 'puzzles/1', type: 'transaction' },
    { path: 'gameConfig/main', type: 'transaction' },
    { path: 'gameConfig/main', type: 'document' },
  ]);
  assert.equal(result.puzzles[0].scheduleLocked, false);
  assert.equal(result.teams[0].adjustedElapsedMs, 15 * 60_000);
});

test('failed overview loads are not cached and can be explicitly retried', async () => {
  const f = fixture();
  f.documents.delete('adminTeamData/a');
  await assert.rejects(f.service.getAdminOverview(), /metadata is missing/);
  f.documents.set('adminTeamData/a', { teamNumber: 1, errandGroup: 'A', errandLocation: 'Office', riddleSet: 'V1', lanternKey: 'test' });
  const result = await f.service.getAdminOverview();
  assert.equal(result.teams.length, 1);
});
