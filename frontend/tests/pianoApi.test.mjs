import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as piano from '../src/services/piano.ts';
import * as rules from '../src/services/gameRules.ts';
import * as crypto from '../src/services/gameCrypto.ts';
import { GAMEPLAY_RUN } from '../src/services/gameplayRun.ts';

const require = createRequire(import.meta.url);
const source = ts.transpileModule(readFileSync(new URL('../src/api/client.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function fixture() {
  const teamId = 'TEAM-001';
  const progressPath = `teams/${teamId}/progress/3`;
  const data = new Map([
    [`teams/${teamId}`, { teamNumber: 1, active: true, assignedUids: ['fixture'], progressRunId: GAMEPLAY_RUN }],
    [`teams/${teamId}/progress/2`, { status: 'solved' }],
    ['gameConfig/main', {}],
    ['puzzles/3', { requires: [], unlockAt: null, maxHints: 3, sortOrder: 3 }],
    [`teamPuzzleContent/${teamId}_3`, { intro: 'Original question', blocks: [{ type: 'text', text: 'Secret riddle text' }] }],
    ['privatePuzzles/3', { acceptedAnswers: ['amavasya'] }],
    [`teams/${teamId}/puzzleRewards/3`, { completionMessage: 'Original reward', fragment: null }],
    [`teams/${teamId}/puzzleHints/3_1`, { text: 'Original hint' }],
  ]);
  const writes = [];
  let failure = false;
  const doc = (base, ...parts) => ({ path: [base?.path, ...parts].filter(Boolean).join('/'), id: parts.at(-1) });
  const snapshot = (ref) => ({
    ref, id: ref.id, exists: () => data.has(ref.path), data: () => data.get(ref.path),
    get: (key) => data.get(ref.path)?.[key],
  });
  class Timestamp { toDate() { return new Date('2026-11-10T09:00:00Z'); } }
  const sdk = {
    Timestamp,
    doc, serverTimestamp: () => new Timestamp(),
    getDoc: async (ref) => { if (failure) throw new Error('Offline'); return snapshot(ref); },
    runTransaction: async (_db, callback) => {
      if (failure) throw new Error('Offline');
      return callback({
        get: async (ref) => snapshot(ref),
        set: (ref, next, options) => {
          writes.push(ref.path);
          data.set(ref.path, options?.merge ? { ...data.get(ref.path), ...next } : next);
        },
      });
    },
  };
  function client() {
    const exports = {};
    runInNewContext(source, {
      exports, Error, Date, Object, Array, window: { dispatchEvent() {} }, Event: class Event {},
      require: (name) => {
        if (name === 'firebase/firestore') return sdk;
        if (name === 'firebase/app') return { FirebaseError: class FirebaseError extends Error {} };
        if (name === '../services/authService') return { initializeSession: async () => ({ uid: 'fixture' }) };
        if (name === '../services/firebase') return {
          requireFirebaseServices: () => ({ firestore: {} }), GameServicesUnavailableError: class extends Error {},
        };
        if (name === '../services/piano') return piano;
        if (name === '../services/stableContent') return { readStableContent: sdk.getDoc };
        if (name === '../services/firestoreReads') return { readDocument: sdk.getDoc, readQuery: sdk.getDocs, recordTransactionRead() {} };
        if (name === '../services/progressUpdates') return { publishProgressUpdate() {} };
        if (name === '../services/gameplayRun') return { GAMEPLAY_RUN };
        if (name === '../services/progressService') return { confirmedPuzzleSummary: (id, metadata) => ({ id, ...metadata }) };
        if (name === '../services/gameRules') return rules;
        if (name === '../services/gameCrypto') return crypto;
        return {};
      },
    });
    return exports.api;
  }
  return { client, teamId, data, writes, progressPath, fail: () => { failure = true; } };
}

test('Question III hides text, answer submission and hints until its team melody has been replayed', async () => {
  const f = fixture();
  const api = f.client();
  const locked = await api.puzzle(3, f.teamId, 1);
  assert.equal(locked.pianoUnlocked, false);
  assert.equal(locked.intro, '');
  assert.equal(locked.blocks.length, 0);
  assert.equal(locked.revealedHints.length, 0);
  await assert.rejects(api.submit(3, f.teamId, 1, 'amavasya'), /melody/);
  await assert.rejects(api.hint(3, f.teamId), /melody/);
  await assert.rejects(api.unlockPiano(f.teamId, piano.teamMelody('TEAM-002')), /melody/);
  assert.equal(f.writes.length, 0);
});

test('successful melody is team-persisted, idempotent and preserves hints and scoring before the original answer', async () => {
  const f = fixture();
  f.data.set(f.progressPath, { hintsUsed: 1, startedAt: 'original-time', extra: 'preserved' });
  const api = f.client();
  await api.unlockPiano(f.teamId, piano.teamMelody(f.teamId));
  assert.equal(f.data.get(f.progressPath).hintsUsed, 1);
  assert.equal(f.data.get(f.progressPath).startedAt, 'original-time');
  assert.equal(f.data.get(f.progressPath).extra, 'preserved');
  assert.equal(f.data.get(f.progressPath).status, undefined, 'the melody alone must not solve Question III');
  await f.client().unlockPiano(f.teamId, piano.teamMelody(f.teamId));
  assert.equal(f.writes.length, 1);
  const detail = await f.client().puzzle(3, f.teamId, 1);
  assert.equal(detail.pianoUnlocked, true);
  assert.equal(detail.intro, 'Original question');
  assert.equal(detail.revealedHints[0], 'Original hint');
  await assert.rejects(api.submit(3, f.teamId, 1, 'wrong'), /does not unlock/);
  const result = await api.submit(3, f.teamId, 1, 'amavasya');
  assert.equal(result.correct, true);
  assert.equal(result.message, 'Original reward');
  assert.equal(f.data.get(f.progressPath).pianoVersion, piano.PIANO_VERSION);
  assert.equal(f.data.get(f.progressPath).pianoCompletedAt.toDate().toISOString(), '2026-11-10T09:00:00.000Z');
  assert.equal(f.data.get(f.progressPath).startedAt, 'original-time');
});

test('normal prerequisites still gate the piano; resets relock it and failures never unlock it', async () => {
  const f = fixture();
  const api = f.client();
  f.data.delete(`teams/${f.teamId}/progress/2`);
  await assert.rejects(api.unlockPiano(f.teamId, piano.teamMelody(f.teamId)), /hidden/);
  assert.equal(f.writes.length, 0);
  f.data.set(`teams/${f.teamId}/progress/2`, { status: 'solved' });
  await api.unlockPiano(f.teamId, piano.teamMelody(f.teamId));
  f.data.delete(f.progressPath);
  assert.equal((await api.puzzle(3, f.teamId, 1)).pianoUnlocked, false);
  f.fail();
  await assert.rejects(api.unlockPiano(f.teamId, piano.teamMelody(f.teamId)), /Offline/);
  assert.equal(f.data.has(f.progressPath), false);
});

test('already solved Question III is not relocked by adding the piano', async () => {
  const f = fixture();
  f.data.set(f.progressPath, { status: 'solved', hintsUsed: 0 });
  const detail = await f.client().puzzle(3, f.teamId, 1);
  assert.equal(detail.state, 'SOLVED');
  assert.equal(detail.pianoUnlocked, true);
  assert.equal(detail.intro, 'Original question');
});
