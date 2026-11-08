import { applicationDefault, deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore, type DocumentSnapshot } from 'firebase-admin/firestore';
import { writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const runIndex = args.indexOf('--run');
const backupIndex = args.indexOf('--backup');
const run = runIndex >= 0 ? args[runIndex + 1] : undefined;
const backupPath = backupIndex >= 0 ? args[backupIndex + 1] : undefined;
const allowed = new Set(['--apply', '--run', '--backup']);
for (let index = 0; index < args.length; index++) {
  if (!allowed.has(args[index])) throw new Error('Usage: migrate-hint-usage.ts --run <current-run> [--apply --backup <external.json>]');
  if (args[index] !== '--apply') index++;
}
if (!run || run.startsWith('--') || (apply && !backupPath)) throw new Error('A current --run and an external --backup for --apply are required.');
if (backupPath) {
  const location = relative(resolve(import.meta.dirname, '..', '..', '..'), resolve(backupPath));
  if (!isAbsolute(backupPath) || (!location.startsWith(`..${sep}`) && !isAbsolute(location))) {
    throw new Error('Backup must be outside the repository.');
  }
}
const ids = Array.from({ length: 12 }, (_, index) => `TEAM-${String(index + 1).padStart(3, '0')}`);
const countSchema = z.number().int().min(0).max(3);
const app = initializeApp({ credential: applicationDefault(), projectId: 'the-lost-light-db' });

function savedCounts(documents: DocumentSnapshot[]) {
  const counts = Object.fromEntries(documents.map((snapshot) => [
    snapshot.id, countSchema.parse(snapshot.get('hintsUsed') ?? 0),
  ]));
  if (Object.values(counts).reduce((sum, count) => sum + count, 0) > 12) {
    throw new Error('Saved progress exceeds the team hint allowance; migration aborted.');
  }
  return counts;
}

try {
  const db = getFirestore(app);
  const configRef = db.doc('gameConfig/main');
  const teamRefs = ids.map((id) => db.doc(`teams/${id}`));
  const progressRefs = ids.flatMap((id) => Array.from({ length: 8 }, (_, index) => db.doc(`teams/${id}/progress/${index + 1}`)));
  const refs = [configRef, ...teamRefs, ...progressRefs];
  const original = await db.getAll(...refs);
  if (original[0].get('progressRunId') !== run) throw new Error('Config run does not match; migration aborted.');
  const usages = ids.map((id, index) => {
    const team = original[index + 1];
    if (!team.exists || team.get('active') !== true || team.get('teamNumber') !== index + 1
      || team.get('progressRunId') !== run) throw new Error(`Unexpected final team: ${id}`);
    const counts = savedCounts(original.slice(13 + index * 8, 13 + (index + 1) * 8));
    const usage = { runId: run, counts };
    if (team.get('hintUsage') !== undefined && !isDeepStrictEqual(team.get('hintUsage'), usage)) {
      throw new Error(`Counter disagrees with progress for ${id}; migration aborted.`);
    }
    return usage;
  });
  console.log(JSON.stringify({
    apply, run, teams: ids.map((id, index) => ({
      id, totalHintsUsed: Object.values(usages[index].counts).reduce((sum, count) => sum + count, 0),
      alreadyInitialised: original[index + 1].get('hintUsage') !== undefined,
    })),
  }, null, 2));
  if (apply) {
    writeFileSync(backupPath!, JSON.stringify(original.map((snapshot) => ({
      path: snapshot.ref.path, exists: snapshot.exists, data: snapshot.data() ?? null,
    })), null, 2), { flag: 'wx' });
    await db.runTransaction(async (transaction) => {
      const current = await transaction.getAll(...refs);
      for (let index = 0; index < original.length; index++) {
        if (!isDeepStrictEqual(current[index].data(), original[index].data())
          || !isDeepStrictEqual(current[index].updateTime, original[index].updateTime)) {
          throw new Error(`Data changed during migration: ${refs[index].path}. Close old tabs and retry with a new backup.`);
        }
      }
      teamRefs.forEach((ref, index) => {
        if (original[index + 1].get('hintUsage') === undefined) transaction.update(ref, { hintUsage: usages[index] });
      });
    });
    const verified = await db.getAll(...refs);
    for (let index = 0; index < verified.length; index++) {
      const expected = index >= 1 && index <= 12
        ? { ...original[index].data(), hintUsage: usages[index - 1] }
        : original[index].data();
      if (!isDeepStrictEqual(verified[index].data(), expected)) throw new Error(`Migration verification failed: ${refs[index].path}`);
    }
    console.log('VERIFIED: all 12 hint counters match saved progress; all other inspected fields and progress are unchanged.');
  } else {
    console.log('Dry run only. No documents changed.');
  }
} finally {
  await deleteApp(app);
}
