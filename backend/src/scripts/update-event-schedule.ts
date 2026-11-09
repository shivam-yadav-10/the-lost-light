import { applicationDefault, deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { existsSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { PUBLIC_PUZZLES } from '../content/public.js';

const START = Date.parse('2026-11-10T07:30:00.000Z');

export async function updateEventSchedule(
  db: Firestore,
  apply: boolean,
  saveBackup: (documents: Array<{ path: string; data: unknown }>) => void,
): Promise<void> {
  const paths = ['gameConfig/main', ...Array.from({ length: 6 }, (_, index) => `puzzles/${index + 1}`),
    ...Array.from({ length: 6 }, (_, index) => `privatePuzzles/${index + 1}`)];
  const references = paths.map((path) => db.doc(path));
  const before = await db.getAll(...references);
  if (before.some((snapshot) => !snapshot.exists)) throw new Error('Missing schedule documents; no changes made.');
  const config = before[0].data()!;
  if (config.eventDate !== '2026-11-10' || config.timezone !== 'Asia/Kolkata'
    || !(config.scheduleStartAt instanceof Timestamp) || config.scheduleStartAt.toMillis() !== START
    || config.testScoringStartAt != null || !isDeepStrictEqual(config.unlockOverrides, {})) {
    throw new Error('Unexpected event configuration or manual overrides; no changes made.');
  }
  const expected = before.map((snapshot) => snapshot.data()!);
  const changes: Array<{ index: number; unlockAt: Timestamp }> = [];
  before.slice(1).forEach((snapshot, offset) => {
    const index = offset + 1;
    const id = Number(snapshot.id);
    const definition = PUBLIC_PUZZLES.find((puzzle) => puzzle.id === id);
    const current = snapshot.get('unlockAt');
    const oldTime = START + (id - 1) * 30 * 60_000;
    const newTime = START + (id - 1) * 20 * 60_000;
    if (!definition || definition.unlockAt !== new Date(newTime).toISOString()
      || !(current instanceof Timestamp) || ![oldTime, newTime].includes(current.toMillis())
      || !isDeepStrictEqual(snapshot.get('requires'), definition.requires)) {
      throw new Error(`Unexpected release or prerequisites at ${snapshot.ref.path}; no changes made.`);
    }
    if (current.toMillis() !== newTime) {
      const unlockAt = Timestamp.fromMillis(newTime);
      expected[index] = { ...expected[index], unlockAt };
      changes.push({ index, unlockAt });
    }
  });
  console.log(`Read 13 schedule/configuration documents; ${changes.length} timestamp updates planned. No team records queried.`);
  if (!apply) { console.log('Read-only preview; no changes made.'); return; }
  if (!changes.length) { console.log('Schedule already uses twenty-minute releases; no writes needed.'); return; }
  saveBackup(before.map((snapshot) => ({ path: snapshot.ref.path, data: snapshot.data() })));
  const batch = db.batch();
  for (const { index, unlockAt } of changes) {
    const snapshot = before[index];
    batch.update(snapshot.ref, { unlockAt }, { lastUpdateTime: snapshot.updateTime! });
  }
  await batch.commit();
  const after = await db.getAll(...references);
  after.forEach((snapshot, index) => {
    if (!snapshot.exists || !isDeepStrictEqual(snapshot.data(), expected[index])) {
      throw new Error(`Schedule verification failed at ${snapshot.ref.path}.`);
    }
  });
  console.log('Twenty-minute releases applied atomically and verified: 26 document reads total. Scoring start, prerequisites and all other fields unchanged.');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 && !(args.length === 2 && args[1] === '--apply')) {
    throw new Error('Usage: update-event-schedule.ts <external-backup.json> [--apply]');
  }
  const externalPath = (path: string) => {
    if (!isAbsolute(path)) throw new Error('Use an absolute path outside the repository.');
    const canonical = existsSync(path) ? realpathSync(path) : resolve(realpathSync(dirname(path)), basename(path));
    const location = relative(resolve(dirname(fileURLToPath(import.meta.url)), '../../..'), canonical);
    if (!location || (!location.startsWith(`..${sep}`) && !isAbsolute(location))) {
      throw new Error('Keep backups and Admin SDK credentials outside the repository.');
    }
    return canonical;
  };
  const backupPath = externalPath(args[0]);
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) throw new Error('External Admin SDK credentials are required.');
  externalPath(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  const app = initializeApp({ credential: applicationDefault(), projectId: 'the-lost-light-db' });
  try {
    await updateEventSchedule(getFirestore(app), args.includes('--apply'), (documents) => {
      writeFileSync(backupPath, JSON.stringify({
        projectId: 'the-lost-light-db', savedAt: new Date().toISOString(), documents,
      }, null, 2), { flag: 'wx' });
    });
  } finally { await deleteApp(app); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
