import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Timestamp } from 'firebase-admin/firestore';
import { PUBLIC_PUZZLES } from '../src/content/public.ts';
import { updateEventSchedule } from '../src/scripts/update-event-schedule.ts';

function fixture() {
  const start = Date.parse('2026-11-10T07:30:00.000Z');
  const stored = new Map([['gameConfig/main', {
    eventDate: '2026-11-10', timezone: 'Asia/Kolkata',
    scheduleStartAt: Timestamp.fromMillis(start), unlockOverrides: {}, progressRunId: 'preserve-run',
  }]]);
  for (const puzzle of PUBLIC_PUZZLES.filter((puzzle) => puzzle.id <= 6)) {
    for (const collection of ['puzzles', 'privatePuzzles']) stored.set(`${collection}/${puzzle.id}`, {
      requires: puzzle.requires, unlockAt: Timestamp.fromMillis(start + (puzzle.id - 1) * 30 * 60_000),
      untouched: { content: 'preserve', hints: [5, 10, 15] },
    });
  }
  const original = new Map(stored);
  let reads = 0;
  let backups = 0;
  const writes = [];
  const db = {
    doc: (path) => ({ path }),
    getAll: async (...refs) => {
      reads += refs.length;
      return refs.map((ref) => ({
        ref, id: ref.path.split('/').at(-1), exists: stored.has(ref.path), updateTime: Timestamp.fromMillis(1),
        data: () => stored.get(ref.path), get: (field) => stored.get(ref.path)?.[field],
      }));
    },
    batch: () => ({
      update: (ref, data, condition) => {
        assert.deepEqual(Object.keys(data), ['unlockAt']);
        assert.ok(condition.lastUpdateTime instanceof Timestamp);
        writes.push({ path: ref.path, data });
      },
      commit: async () => { for (const { path, data } of writes) stored.set(path, { ...stored.get(path), ...data }); },
    }),
  };
  return { db, stored, original, writes, reads: () => reads, backups: () => backups,
    backup: (documents) => { backups++; assert.equal(documents.length, 13); assert.equal(writes.length, 0); } };
}

test('schedule migration reads only 13 schedule records in preview and never writes or backs up', async () => {
  const f = fixture();
  await updateEventSchedule(f.db, false, f.backup);
  assert.equal(f.reads(), 13);
  assert.equal(f.backups(), 0);
  assert.equal(f.writes.length, 0);
});

test('twenty-minute migration uses 26 reads, changes ten timestamp fields and preserves everything else', async () => {
  const f = fixture();
  await updateEventSchedule(f.db, true, f.backup);
  assert.equal(f.reads(), 26);
  assert.equal(f.backups(), 1);
  assert.equal(f.writes.length, 10);
  for (const [path, data] of f.stored) {
    const old = f.original.get(path);
    if (path === 'gameConfig/main') assert.deepEqual(data, old);
    else {
      const { unlockAt, ...rest } = data;
      const { unlockAt: previous, ...oldRest } = old;
      assert.deepEqual(rest, oldRest);
      const id = Number(path.split('/')[1]);
      assert.equal(unlockAt.toDate().toISOString(), PUBLIC_PUZZLES.find((puzzle) => puzzle.id === id).unlockAt);
    }
  }
  await updateEventSchedule(f.db, true, f.backup);
  assert.equal(f.writes.length, 10, 'idempotent rerun writes nothing');
  assert.equal(f.backups(), 1);
});

test('schedule migration refuses overrides, unexpected releases and prerequisites before any backup or writes', async () => {
  for (const change of [
    (f) => { f.stored.get('gameConfig/main').unlockOverrides = { 1: Timestamp.now() }; },
    (f) => { f.stored.get('puzzles/2').unlockAt = Timestamp.fromMillis(0); },
    (f) => { f.stored.get('privatePuzzles/4').requires = []; },
  ]) {
    const f = fixture();
    change(f);
    await assert.rejects(updateEventSchedule(f.db, true, f.backup), /Unexpected/);
    assert.equal(f.backups(), 0);
    assert.equal(f.writes.length, 0);
  }
});
