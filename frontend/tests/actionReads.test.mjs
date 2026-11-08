import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as rules from '../src/services/gameRules.ts';
import * as piano from '../src/services/piano.ts';
import * as hanoi from '../src/services/hanoi.ts';
import * as hidden from '../src/services/hiddenWords.ts';
import * as riddles from '../src/services/riddleAnswers.ts';
import * as overlay from '../src/services/convergenceOverlay.ts';
import * as convergence from '../src/services/convergenceAnswer.ts';
import * as crypto from '../src/services/gameCrypto.ts';
import { GAMEPLAY_RUN } from '../src/services/gameplayRun.ts';

const compile = (file) => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function fixture(id = 1) {
  const team = 'TEAM-001';
  const partner = 'TEAM-002';
  const reads = [];
  const writes = [];
  const updates = [];
  let conflict = null;
  const data = new Map([
    [`teams/${team}`, { teamNumber: 1, teamName: 'Fixture', active: true, assignedUids: ['device'],
      progressRunId: GAMEPLAY_RUN, errandGroup: 'A', riddleSet: 'V1',
      hintUsage: { runId: GAMEPLAY_RUN, counts: Object.fromEntries(rules.PUZZLE_IDS.map((id) => [String(id), 0])) } }],
    ['gameConfig/main', { lightMessages: { partial: 'The circle awaits.' } }],
    [`privateTeamData/${team}`, { lanternKey: '123456' }],
  ]);
  for (let puzzle = 1; puzzle <= 8; puzzle++) {
    data.set(`teamPuzzleContent/${team}_${puzzle}`, { intro: `Question ${puzzle}`, blocks: [{ type: 'text', text: 'Puzzle text' }] });
  }
  class Timestamp {
    constructor(value = '2026-11-10T09:00:00Z') { this.value = value; }
    toDate() { return new Date(this.value); }
  }
  for (let puzzle = 1; puzzle <= 8; puzzle++) {
    data.set(`puzzles/${puzzle}`, { id: puzzle, slug: `puzzle-${puzzle}`, title: `Puzzle ${puzzle}`,
      fragmentName: `Fragment ${puzzle}`, kind: puzzle <= 6 ? 'core' : puzzle === 7 ? 'convergence' : 'vault',
      sortOrder: puzzle, maxHints: 3, hintPenalties: [5, 10, 15], unlockAt: null,
      requires: puzzle === 6 ? [1, 2, 3, 4, 5] : [] });
    data.set(`privatePuzzles/${puzzle}`, { acceptedAnswers: ['fixture'] });
    data.set(`teams/${team}/puzzleRewards/${puzzle}`, { completionMessage: 'Confirmed reward', fragment: null });
    for (let hint = 1; hint <= 3; hint++) data.set(`teams/${team}/puzzleHints/${puzzle}_${hint}`, { text: `Hint ${hint}` });
    if (puzzle < id) data.set(`teams/${team}/progress/${puzzle}`, { status: 'solved', hintsUsed: 0, solvedAt: new Timestamp() });
  }
  data.set('privatePuzzles/2', { acceptedAnswersByGroup: { A: ['fixture'] } });
  data.set('privatePuzzles/4', { hiddenWordsByGroup: { W1: ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta'] } });
  data.set('privatePuzzles/5', { acceptedAnswersByGroup: { V1: ['fixture'] },
    riddleAnswersByGroup: { V1: ['alpha', 'beta', 'gamma', 'delta', 'epsilon'] } });
  data.set('privatePuzzles/7', { convergenceAnswersBySet: { R1: 'light' }, overlayWord: 'unite' });
  const circle = (seal) => ({ version: 2, memberIds: [team, partner], seal, riddleSet: 'R1',
    card: { width: 31, height: 9, lit: [0] },
    clue: { title: 'Fixture', text: 'Fixture', detail: 'Fixture', art: 'Fixture' } });
  data.set(`teamGameData/${team}`, { convergence: circle('OWN') });
  data.set(`teamGameData/${partner}`, { convergence: circle('PARTNER') });
  data.set(`teams/${team}/convergenceSeals/${partner}`, { version: 2, sealHash: 'hash:PARTNER' });
  data.set(`teams/${partner}/convergence/arrival`, { arrivedAt: new Timestamp() });
  if (id === 3) data.set(`teams/${team}/progress/3`, { pianoVersion: 1, pianoCompletedAt: new Timestamp() });
  const firestore = {};
  const doc = (base, ...parts) => {
    const path = [base?.path, ...parts].filter(Boolean).join('/');
    return { path, id: path.split('/').at(-1), firestore };
  };
  const snapshot = (ref) => {
    const value = data.get(ref.path);
    return { id: ref.id, exists: () => value !== undefined, data: () => value, get: (key) => value?.[key] };
  };
  const sdk = {
    Timestamp, doc, collection: doc, serverTimestamp: () => new Timestamp(),
    getDoc: async (ref) => { reads.push({ path: ref.path, type: 'document' }); return snapshot(ref); },
    getDocs: async (ref) => {
      reads.push({ path: ref.path, type: 'query' });
      return { docs: [...data.keys()].filter((path) => path.startsWith(`${ref.path}/`)
        && !path.slice(ref.path.length + 1).includes('/')).map((path) => snapshot(doc(firestore, path))) };
    },
    runTransaction: async (_db, callback) => {
      const pending = [];
      const result = await callback({
        get: async (ref) => {
          assert.equal(pending.length, 0, 'all transaction reads must precede writes');
          reads.push({ path: ref.path, type: 'transaction' });
          return snapshot(ref);
        },
        set: (ref, value, options) => pending.push({ ref, value, options }),
      });
      if (conflict) {
        const change = conflict;
        conflict = null;
        change();
        return sdk.runTransaction(_db, callback);
      }
      for (const { ref, value, options } of pending) {
        writes.push(ref.path);
        data.set(ref.path, options?.merge ? { ...data.get(ref.path), ...value } : value);
      }
      return result;
    },
  };
  const modules = {
    'firebase/firestore': sdk,
    'firebase/app': { FirebaseError: class extends Error {} },
    authService: { initializeSession: async () => ({ uid: 'device' }) },
    firebase: { requireFirebaseServices: () => ({ firestore }), GameServicesUnavailableError: class extends Error {} },
    teamService: { TeamLoginError: class extends Error {} },
    stableContent: { readStableContent: sdk.getDoc },
    firestoreReads: { readDocument: sdk.getDoc, readQuery: sdk.getDocs, recordTransactionRead() {} },
    progressUpdates: { publishProgressUpdate: (update) => updates.push(update) },
    gameplayRun: { GAMEPLAY_RUN }, gameRules: rules, piano, hanoi, hiddenWords: hidden,
    riddleAnswers: riddles, convergenceOverlay: overlay, convergenceAnswer: convergence,
    hanoiProgress: { parseHanoiDraft: (value) => value ?? { version: 1, disks: 6, revision: 0, moves: '' } },
    gameCrypto: { ...crypto, hashText: async (value) => `hash:${value}` },
  };
  function load(file) {
    const exports = {};
    runInNewContext(compile(file), {
      exports, Error, Date, Object, Array, JSON, Map,
      window: { dispatchEvent() { assert.fail('Full progress reload events must not be emitted'); } },
      require: (name) => {
        const key = name.startsWith('.') ? name.split('/').at(-1) : name;
        assert.ok(key in modules, `Unexpected dependency: ${name}`);
        return modules[key];
      },
    });
    return exports;
  }
  const progress = load('../src/services/progressService.ts');
  modules.progressService = progress;
  const { api } = load('../src/api/client.ts');
  return { api, progress, data, reads, writes, updates, team, partner, Timestamp,
    path: `teams/${team}/progress/${id}`, conflict: (change) => { conflict = change; } };
}

const cases = [
  [1, 'fixture', undefined, 6],
  [2, 'fixture', undefined, 7],
  [3, 'fixture', undefined, 7],
  [4, 'alpha beta gamma delta', undefined, 7],
  [5, 'fixture', JSON.stringify(['alpha', 'beta', 'gamma', 'delta', 'epsilon']), 7],
  [6, 'fixture', undefined, 11],
  [7, 'light unite', JSON.stringify([{ teamId: 'TEAM-002', x: 0, y: 0, rotation: 0 }]), 13],
];

test('dashboard light refresh reads one progress query and only newly earned rewards, reusing all other state', async () => {
  const f = fixture(2);
  await f.progress.getTeamProgress(f.team, 1);
  f.reads.length = 0;
  await f.progress.refreshPuzzleProgress(f.team);
  assert.deepEqual(f.reads, [{ path: `teams/${f.team}/progress`, type: 'query' }]);
  f.data.set(f.path, { status: 'solved', hintsUsed: 1, solvedAt: new f.Timestamp() });
  f.data.set('gameConfig/main', { unlockOverrides: { 3: new f.Timestamp('2099-01-01T00:00:00Z') } });
  f.reads.length = 0;
  const result = await f.progress.refreshPuzzleProgress(f.team);
  assert.deepEqual(f.reads, [
    { path: `teams/${f.team}/progress`, type: 'query' },
    { path: `teams/${f.team}/puzzleRewards/2`, type: 'document' },
  ]);
  assert.equal(result.coreSolved, 2);
  assert.equal(result.totalHintsUsed, 1);
  assert.equal(result.penaltyMinutes, 5);
  assert.equal(result.puzzles[2].state, 'AVAILABLE', 'light refresh retains the cached schedule');
  f.reads.length = 0;
  await f.progress.refreshPuzzleProgress(f.team);
  assert.equal(f.reads.length, 1, 'earned rewards remain in the model across repeated light refreshes');
});

test('light refresh errors preserve the prior model and require an explicit retry', async () => {
  const f = fixture(2);
  await assert.rejects(f.progress.refreshPuzzleProgress(f.team), /Load your team/);
  await f.progress.getTeamProgress(f.team, 1);
  f.data.set(f.path, { status: 'solved', hintsUsed: 0, solvedAt: new f.Timestamp() });
  f.data.delete(`teams/${f.team}/puzzleRewards/2`);
  await assert.rejects(f.progress.refreshPuzzleProgress(f.team));
  assert.equal(f.progress.projectTeamProgress(f.team).coreSolved, 1);
  f.data.set(`teams/${f.team}/puzzleRewards/2`, { fragment: null });
  assert.equal((await f.progress.refreshPuzzleProgress(f.team)).coreSolved, 2);
  f.data.delete(f.path);
  assert.equal((await f.progress.refreshPuzzleProgress(f.team)).coreSolved, 1, 'fresh progress replaces removed records');
  f.data.set(`teams/${f.team}/progress/99`, { status: 'solved', hintsUsed: 0 });
  await assert.rejects(f.progress.refreshPuzzleProgress(f.team));
});

test('all puzzle displays reuse session identity, metadata, progress and release gates; only content is fetched', async () => {
  for (let id = 1; id <= 8; id++) {
    const f = fixture(id);
    await f.progress.getTeamProgress(f.team, 1);
    f.reads.length = 0;
    const detail = await f.api.puzzle(id, f.team, 1);
    assert.equal(detail.intro, `Question ${id}`);
    assert.deepEqual(f.reads, [{ path: `teamPuzzleContent/${f.team}_${id}`, type: 'document' }]);
    if (id === 8) assert.equal(detail.savedTower.moves, '');
    await assert.rejects(f.api.puzzle(id, f.team, 99), /linked/);
  }
});

test('piano question is preloaded behind its local UI gate; completion saves once without a second detail load', async () => {
  const f = fixture(3);
  f.data.delete(f.path);
  await f.progress.getTeamProgress(f.team, 1);
  const locked = await f.api.puzzle(3, f.team, 1);
  assert.equal(locked.pianoUnlocked, false);
  assert.equal(locked.blocks[0].text, 'Puzzle text');
  f.reads.length = 0;
  await f.api.unlockPiano(f.team, piano.teamMelody(f.team));
  assert.equal(f.writes.length, 1);
  assert.equal(f.reads.length, 5, 'only fresh team, metadata, config, predecessor and own progress validation');
  assert.ok(f.reads.every((read) => read.type === 'transaction'));
  const unlocked = { ...locked, pianoUnlocked: true };
  assert.equal(unlocked.intro, 'Question 3');
  assert.equal(f.updates.length, 1);
  f.progress.projectTeamProgress(f.team, f.updates[0]);
  assert.equal(f.progress.cachedPuzzleState(f.team, 3).progress.pianoVersion, 1);
});

test('verified seal returns the exact partner card and clue without needing an arrival-state reload', async () => {
  const f = fixture(7);
  f.data.set(`teams/${f.partner}`, { teamName: 'Partner' });
  f.data.set('convergenceSealLookups/hash:PARTNER', { ownerTeamId: f.partner });
  const result = await f.api.verifySeal(f.team, 'PARTNER');
  assert.equal(result.partner.teamId, f.partner);
  assert.equal(result.partner.verified, true);
  assert.equal(result.partner.arrived, true);
  assert.equal(result.partner.clueIndex, 1);
  assert.equal(result.partner.card.width, 31);
  assert.equal(result.partnerName, 'Partner');
  assert.ok(f.reads.every((read) => read.type !== 'query'), 'seal acceptance never scans all partners or seals');
});
for (const [id, answer, proof, expectedReads] of cases) {
  test(`Question ${id} reads each validation document once, confirms only its result and patches the dashboard`, async () => {
    const f = fixture(id);
    await f.progress.getTeamProgress(f.team, 1);
    f.reads.length = 0;
    const result = await f.api.submit(id, f.team, 1, answer, proof);
    const validation = f.reads.filter((read) => read.type === 'transaction');
    assert.equal(validation.length, expectedReads);
    assert.equal(new Set(validation.map((read) => read.path)).size, expectedReads);
    assert.deepEqual(f.reads.filter((read) => read.type !== 'transaction'), [{ path: f.path, type: 'document' }]);
    assert.equal(result.puzzle.state, 'SOLVED');
    assert.equal(result.puzzle.solvedAt, '2026-11-10T09:00:00.000Z');
    assert.equal(f.writes.length, 1);
    assert.equal(f.updates.length, 1);
    const calls = f.reads.length;
    const projected = f.progress.projectTeamProgress(f.team, f.updates[0]);
    assert.equal(projected.puzzles.find((puzzle) => puzzle.id === id).state, 'SOLVED');
    assert.equal(projected.coreSolved, Math.min(id, 6));
    if (id === 7) assert.equal(projected.lightPercent, 100);
    assert.equal(f.reads.length, calls, 'derived progress performs no database reads');
    await assert.rejects(f.api.submit(id, f.team, 1, answer, proof), /already been solved/);
    assert.equal(f.writes.length, 1);
  });
}

test('Vault validates replay, saved-tower conflict and own proof, then updates completion and score locally', async () => {
  const f = fixture(8);
  let moves = '';
  function solve(disks, from, to, spare) {
    if (!disks) return;
    solve(disks - 1, from, spare, to);
    moves += `${from}${to}`;
    solve(disks - 1, spare, to, from);
  }
  solve(6, 0, 2, 1);
  f.data.set(f.path, { status: 'in_progress', hintsUsed: 2, hanoiDraft: { moves: '01' } });
  const proof = JSON.stringify({ code: '123456', moves });
  await assert.rejects(f.api.submit(8, f.team, 1, 'fixture', proof), /changed the tower/);
  f.data.set(f.path, { status: 'in_progress', hintsUsed: 2, hanoiDraft: { moves } });
  await f.progress.getTeamProgress(f.team, 1);
  f.reads.length = 0;
  await f.api.submit(8, f.team, 1, 'fixture', proof);
  assert.equal(f.reads.filter((read) => read.type === 'transaction').length, 8);
  assert.equal(f.reads.length, 9);
  const projected = f.progress.projectTeamProgress(f.team, f.updates[0]);
  assert.equal(projected.gameComplete, true);
  assert.equal(projected.penaltyMinutes, 15);
  assert.equal(projected.totalHintsUsed, 2);
  assert.equal(projected.vaultSolvedAt, '2026-11-10T09:00:00.000Z');
  assert.equal(projected.adjustedElapsedMs, projected.elapsedMs + 15 * 60_000);
});

test('submission rejects stale device/run, live re-locks, missing prerequisites and wrong answers without writing', async () => {
  for (const edit of [
    (f) => { f.data.get(`teams/${f.team}`).assignedUids = []; },
    (f) => { f.data.get(`teams/${f.team}`).active = false; },
    (f) => { f.data.get(`teams/${f.team}`).progressRunId = 'old-run'; },
    (f) => { f.data.get('gameConfig/main').unlockOverrides = { 2: new f.Timestamp('2099-01-01T00:00:00Z') }; },
    (f) => { f.data.delete(`teams/${f.team}/progress/1`); },
    (f) => { f.data.get('privatePuzzles/2').acceptedAnswersByGroup.A = ['different']; },
  ]) {
    const f = fixture(2); edit(f);
    await assert.rejects(f.api.submit(2, f.team, 1, 'fixture'));
    assert.equal(f.writes.length, 0);
    assert.equal(f.updates.length, 0);
  }
});

test('a transaction retry revalidates a changed release instead of committing the earlier approval', async () => {
  const f = fixture(2);
  f.conflict(() => { f.data.get('gameConfig/main').unlockOverrides = { 2: new f.Timestamp('2099-01-01T00:00:00Z') }; });
  await assert.rejects(f.api.submit(2, f.team, 1, 'fixture'), /hidden/);
  assert.equal(f.writes.length, 0);
  assert.equal(f.updates.length, 0);
  assert.equal(f.reads.filter((read) => read.path === 'gameConfig/main').length, 2);
});

test('three-team Convergence validates every partner, once each, before committing', async () => {
  const f = fixture(7);
  const third = 'TEAM-003';
  const members = [f.team, f.partner, third];
  const circle = f.data.get(`teamGameData/${f.partner}`).convergence;
  f.data.get(`teamGameData/${f.team}`).convergence.memberIds = members;
  circle.memberIds = members;
  f.data.set(`teamGameData/${third}`, { convergence: { ...circle, seal: 'THIRD' } });
  f.data.set(`teams/${third}/convergence/arrival`, { reachedAt: new f.Timestamp() });
  f.data.set(`teams/${f.team}/convergenceSeals/${third}`, { version: 2, sealHash: 'hash:THIRD' });
  const proof = JSON.stringify([f.partner, third].map((teamId) => ({ teamId, x: 0, y: 0, rotation: 0 })));
  await f.api.submit(7, f.team, 1, 'light unite', proof);
  const validation = f.reads.filter((read) => read.type === 'transaction');
  assert.equal(validation.length, 17);
  assert.equal(new Set(validation.map((read) => read.path)).size, 17);
  assert.equal(f.writes.length, 1);
});

test('piano, Five Dawns and Convergence proof/partner checks cannot be bypassed by local UI state', async () => {
  const pianoFixture = fixture(3);
  pianoFixture.data.delete(pianoFixture.path);
  await assert.rejects(pianoFixture.api.submit(3, pianoFixture.team, 1, 'fixture'), /melody/);
  const dawns = fixture(5);
  await assert.rejects(dawns.api.submit(5, dawns.team, 1, 'fixture', '[]'), /five day riddles/);
  for (const change of [
    (f) => f.data.delete(`teams/${f.partner}/convergence/arrival`),
    (f) => f.data.delete(`teams/${f.team}/convergenceSeals/${f.partner}`),
    (f) => { f.data.get(`teamGameData/${f.partner}`).convergence.riddleSet = 'R2'; },
  ]) {
    const f = fixture(7); change(f);
    await assert.rejects(f.api.submit(7, f.team, 1, 'together unite',
      JSON.stringify([{ teamId: f.partner, x: 0, y: 0, rotation: 0 }])), /Every partner/);
    assert.equal(f.writes.length, 0);
  }
});

test('hint transactions reuse prerequisite reads, update penalties locally and retain both caps', async () => {
  const f = fixture(3);
  await f.progress.getTeamProgress(f.team, 1);
  f.reads.length = 0;
  const hint = await f.api.hint(3, f.team);
  const validation = f.reads.filter((read) => read.type === 'transaction');
  assert.equal(validation.length, 6, 'team + metadata + config + predecessor + own progress + next hint');
  assert.equal(new Set(validation.map((read) => read.path)).size, 6);
  assert.equal(f.reads.length, 7, 'only the committed progress document is reread');
  assert.deepEqual([...hint.hints], ['Hint 1']);
  const projected = f.progress.projectTeamProgress(f.team, f.updates[0]);
  assert.equal(projected.totalHintsUsed, 1);
  assert.equal(projected.penaltyMinutes, 5);
  f.data.set(f.path, { ...f.data.get(f.path), hintsUsed: 3 });
  f.data.get(`teams/${f.team}`).hintUsage.counts['3'] = 3;
  await assert.rejects(f.api.hint(3, f.team), /No whispers|No hints|hints remain|whispers remain/i);
  f.data.set(f.path, { ...f.data.get(f.path), hintsUsed: 0 });
  f.data.get(`teams/${f.team}`).hintUsage.counts['3'] = 0;
  for (let id = 4; id <= 7; id++) {
    f.data.set(`teams/${f.team}/progress/${id}`, { status: 'in_progress', hintsUsed: 3 });
    f.data.get(`teams/${f.team}`).hintUsage.counts[String(id)] = 3;
  }
  await assert.rejects(f.api.hint(3, f.team), /12|whispers|hints/i);
  assert.equal(f.writes.length, 2);
});

test('hint allowance sync does not require rereading unseen rewards from another device', async () => {
  const f = fixture(3);
  await f.progress.getTeamProgress(f.team, 1);
  f.data.set(`teams/${f.team}/progress/4`, { status: 'solved', hintsUsed: 1, solvedAt: new f.Timestamp() });
  f.data.get(`teams/${f.team}`).hintUsage.counts['4'] = 1;
  await f.api.hint(3, f.team);
  const projected = f.progress.projectTeamProgress(f.team, f.updates[0]);
  assert.equal(projected.totalHintsUsed, 2);
  assert.notEqual(projected.puzzles[3].state, 'SOLVED', 'other-device solutions require explicit refresh');
  assert.equal(projected.coreSolved, 2);
});

for (const [id, count] of [[1, 5], [2, 6], [3, 6], [4, 6], [5, 6], [6, 10], [7, 6], [8, 6]]) {
  test(`question ${id} hint reads only its counter, own progress and required prerequisites`, async () => {
    const f = fixture(id);
    await f.api.hint(id, f.team);
    const validation = f.reads.filter((read) => read.type === 'transaction');
    assert.equal(validation.length, count);
    assert.equal(f.reads.length, count + 1);
    assert.equal(new Set(validation.map((read) => read.path)).size, count);
    assert.equal(f.data.get(`teams/${f.team}`).hintUsage.counts[String(id)], 1);
    assert.equal(f.data.get(f.path).hintsUsed, 1);
  });
}

test('missing counters initialise once from actual progress, preserving used hints', async () => {
  const f = fixture(3);
  delete f.data.get(`teams/${f.team}`).hintUsage;
  f.data.set(`teams/${f.team}/progress/4`, { status: 'in_progress', hintsUsed: 2 });
  const first = await f.api.hint(3, f.team);
  assert.equal(first.teamHintsUsed, 3);
  assert.equal(f.reads.filter((read) => read.type === 'transaction').length, 12);
  assert.equal(f.data.get(`teams/${f.team}`).hintUsage.counts['4'], 2);
  f.reads.length = 0;
  const second = await f.api.hint(3, f.team);
  assert.equal(second.teamHintsUsed, 4);
  assert.equal(f.reads.filter((read) => read.type === 'transaction').length, 6);
});

test('concurrent purchases on different questions retry against the shared counter and cannot exceed twelve', async () => {
  const f = fixture(3);
  const counts = f.data.get(`teams/${f.team}`).hintUsage.counts;
  for (const [id, used] of [[4, 3], [5, 3], [6, 3], [7, 2]]) counts[String(id)] = used;
  f.conflict(() => { counts['7'] = 3; });
  await assert.rejects(f.api.hint(3, f.team), /all 12/);
  assert.equal(f.writes.length, 0);
});

test('concurrent purchases on the same question return the next hint after retry without losing usage', async () => {
  const f = fixture(3);
  f.conflict(() => {
    f.data.set(f.path, { ...f.data.get(f.path), hintsUsed: 1 });
    f.data.get(`teams/${f.team}`).hintUsage.counts['3'] = 1;
  });
  const result = await f.api.hint(3, f.team);
  assert.equal(result.hintsUsed, 2);
  assert.deepEqual([...result.hints], ['Hint 1', 'Hint 2']);
  assert.equal(f.data.get(`teams/${f.team}`).hintUsage.counts['3'], 2);
});

test('missing hints and mismatched counters never consume the allowance', async () => {
  for (const edit of [
    (f) => f.data.delete(`teams/${f.team}/puzzleHints/3_1`),
    (f) => { f.data.get(`teams/${f.team}`).hintUsage.counts['3'] = 1; },
    (f) => { f.data.get(`teams/${f.team}`).hintUsage.runId = 'old-run'; },
  ]) {
    const f = fixture(3);
    edit(f);
    await assert.rejects(f.api.hint(3, f.team));
    assert.equal(f.writes.length, 0);
  }
});

test('marker, intro and fragment updates reuse the existing projection without reads; malformed updates fail explicitly', async () => {
  const f = fixture(1);
  await f.progress.getTeamProgress(f.team, 1);
  const reads = f.reads.length;
  const projected = f.progress.projectTeamProgress(f.team, {
    teamDocId: f.team, team: { introSeenAt: new f.Timestamp() },
    checkpoint: { id: 'marker', data: { code: 'LIGHT', title: 'Fixture marker', visitedAt: new f.Timestamp() } },
    puzzle: { id: 1, progress: { status: 'solved', hintsUsed: 0, solvedAt: new f.Timestamp() },
      reward: { fragment: { symbol: 'star', number: 1, direction: 'N', keyword: 'LIGHT', colour: 'Gold' } } },
  });
  assert.equal(projected.introSeen, true);
  assert.equal(projected.checkpoints.length, 1);
  assert.equal(projected.fragments.length, 1);
  assert.equal(projected.puzzles[1].state, 'AVAILABLE');
  assert.equal(f.reads.length, reads);
  assert.throws(() => f.progress.projectTeamProgress(f.team, {
    teamDocId: f.team, puzzle: { id: 1, progress: { status: 'invalid' } },
  }));
  assert.equal(f.progress.projectTeamProgress(f.team).coreSolved, 1, 'invalid updates do not corrupt the model');
});
