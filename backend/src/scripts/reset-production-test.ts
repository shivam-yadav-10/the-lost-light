import { applicationDefault, deleteApp, initializeApp } from 'firebase-admin/app';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

const START = '2026-11-05T06:30:00.000Z';
const RUN = 'production-test-2026-11-05-noon-ist';
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const backupIndex = args.indexOf('--backup');
const backupPath = backupIndex >= 0 ? args[backupIndex + 1] : undefined;
if (apply && !backupPath) throw new Error('An external --backup file path is required for --apply.');
if (backupPath) {
  const location = relative(resolve('..'), resolve(backupPath));
  if (!isAbsolute(backupPath) || (!location.startsWith(`..${sep}`) && !isAbsolute(location))) {
    throw new Error('The backup must be an absolute path outside the repository.');
  }
}
const app = initializeApp({ credential: applicationDefault(), projectId: 'the-lost-light-db' });

try {
  const db = getFirestore(app);
  const teams = await db.collection('teams').get();
  if (teams.empty) throw new Error('No teams found; reset aborted.');
  if (teams.size > 499) throw new Error('Reset supports at most 499 teams per batch.');
  const preservedCollections = new Set(['puzzleRewards', 'puzzleHints']);
  const deletions = [];
  const preserved = new Map<string, string>();
  const backup: Array<{ path: string; data: unknown }> = [];
  for (const team of teams.docs) {
    backup.push({ path: team.ref.path, data: team.data() });
    const collections = await team.ref.listCollections();
    for (const collection of collections) {
      const documents = await collection.get();
      for (const document of documents.docs) {
        if (preservedCollections.has(collection.id)) {
          preserved.set(document.ref.path, JSON.stringify(document.data()));
        } else {
          if ((await document.ref.listCollections()).length) {
            throw new Error(`Unexpected nested progress below ${document.ref.path}; reset aborted.`);
          }
          deletions.push(document.ref);
          backup.push({ path: document.ref.path, data: document.data() });
        }
      }
    }
  }
  const configRef = db.doc('gameConfig/main');
  const config = await configRef.get();
  if (!config.exists) throw new Error('Game config missing; reset aborted.');
  backup.push({ path: configRef.path, data: config.data() });
  const schedule = Object.fromEntries(Array.from({ length: 6 }, (_, index) => [
    String(index + 1), Timestamp.fromMillis(Date.parse(START) + index * 10 * 60_000),
  ]));
  console.log(JSON.stringify({
    apply, teams: teams.docs.map((team) => ({ id: team.id, name: team.get('teamName') })),
    deletingProgressDocuments: deletions.length,
    schedule: Object.fromEntries(Object.entries(schedule).map(([id, time]) => [id, time.toDate().toISOString()])),
    scoringStart: START, run: RUN,
  }, null, 2));
  if (apply) {
    writeFileSync(backupPath!, JSON.stringify(backup, null, 2), { flag: 'wx' });
    for (let offset = 0; offset < deletions.length; offset += 400) {
      const batch = db.batch();
      for (const reference of deletions.slice(offset, offset + 400)) batch.delete(reference);
      await batch.commit();
    }
    const batch = db.batch();
    for (const team of teams.docs) {
      batch.update(team.ref, {
        assignedUids: [],
        introSeenAt: FieldValue.delete(),
        lastSeenAt: FieldValue.delete(),
        progressRunId: RUN,
      });
    }
    batch.update(configRef, {
      eventDate: '2026-11-05',
      unlockOverrides: schedule,
      testScoringStartAt: Timestamp.fromDate(new Date(START)),
      progressRunId: RUN,
      updatedAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();
    for (const reference of deletions) {
      if ((await reference.get()).exists) throw new Error(`Progress still exists: ${reference.path}`);
    }
    for (const team of teams.docs) {
      const current = await team.ref.get();
      if (current.get('assignedUids')?.length !== 0 || current.get('introSeenAt') != null
        || current.get('lastSeenAt') != null || current.get('progressRunId') !== RUN) {
        throw new Error(`Team reset verification failed: ${team.id}`);
      }
      const expected = { ...team.data() };
      delete expected.assignedUids;
      delete expected.introSeenAt;
      delete expected.lastSeenAt;
      delete expected.progressRunId;
      const actual = { ...current.data() };
      delete actual.assignedUids;
      delete actual.introSeenAt;
      delete actual.lastSeenAt;
      delete actual.progressRunId;
      if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Team identity changed: ${team.id}`);
    }
    for (const [path, original] of preserved) {
      if (JSON.stringify((await db.doc(path).get()).data()) !== original) throw new Error(`Content changed: ${path}`);
    }
    const savedConfig = await configRef.get();
    if (JSON.stringify(savedConfig.get('unlockOverrides')) !== JSON.stringify(schedule)
      || savedConfig.get('testScoringStartAt').toDate().toISOString() !== START) {
      throw new Error('Test schedule read-back failed.');
    }
    console.log('VERIFIED: all team progress and browser bindings cleared; content preserved; test schedule and scoring start saved.');
  } else {
    console.log('Dry run only. No documents changed.');
  }
} finally {
  await deleteApp(app);
}
