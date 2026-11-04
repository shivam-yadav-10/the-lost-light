import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import { CHECKPOINTS, ERRAND_LOCATIONS, errandGroup, protectedPuzzle } from '../content/protected.js';
import { PUBLIC_PUZZLES } from '../content/public.js';
import { normaliseAnswer } from '../services/normalise.js';

/** Reassigns Errand variants only, preserving gameplay, logins, and release overrides. */
export async function provisionErrands(firestore: Firestore, apply: boolean): Promise<void> {
  const roster = await firestore.collection('teams').get();
  if (!roster.docs.length) throw new Error('No teams found; provision the roster first.');
  const puzzle = PUBLIC_PUZZLES.find((candidate) => candidate.id === 2)!;
  const secret = protectedPuzzle(2);
  const writes = new Map<string, DocumentData>();
  const numbers = new Set<number>();
  for (const team of roster.docs) {
    const number = team.get('teamNumber');
    if (!Number.isInteger(number) || number < 1 || numbers.has(number)) {
      throw new Error(`Invalid or duplicate team number in teams/${team.id}. No changes written.`);
    }
    numbers.add(number);
    const group = errandGroup(number);
    writes.set(`teams/${team.id}`, { errandGroup: group });
    writes.set(`privateTeamData/${team.id}`, { errandGroup: group, errandLocation: ERRAND_LOCATIONS[group] });
    writes.set(`teamPuzzleContent/${team.id}_2`, {
      teamId: team.id, puzzleId: '2', intro: puzzle.intro,
      blocks: [...puzzle.blocks, ...puzzle.variants![group]],
    });
    secret.hints.forEach((hint, index) => writes.set(`teams/${team.id}/puzzleHints/2_${index + 1}`, {
      puzzleId: '2', hintNumber: index + 1, text: hint.text, penaltyMinutes: hint.penaltyMinutes,
    }));
    console.log(`Team ${team.id}: Errand ${group} (${ERRAND_LOCATIONS[group]}).`);
  }
  writes.set('privatePuzzles/2', {
    ...secret, acceptedAnswers: [],
    acceptedAnswersByGroup: Object.fromEntries(Object.entries(secret.answersByGroup!).map(([group, answers]) => [
      group, answers.map((answer) => answer.toLowerCase().replace(/[^a-z0-9]/g, '')),
    ])),
  });
  for (const checkpoint of CHECKPOINTS.filter((candidate) => candidate.puzzleId === 2)) {
    const hash = createHash('sha256').update(normaliseAnswer(checkpoint.code)).digest('hex');
    writes.set(`checkpoints/${hash}`, { title: checkpoint.title, message: checkpoint.message, puzzleId: 2 });
  }
  console.log(`Prepared ${writes.size} targeted document merges. Progress, hints used, logins, schedules, and other puzzles are preserved.`);
  if (!apply) { console.log('Dry run only. Add --apply to write.'); return; }
  const entries = [...writes];
  for (let offset = 0; offset < entries.length; offset += 400) {
    const chunk = entries.slice(offset, offset + 400);
    const batch = firestore.batch();
    for (const [path, data] of chunk) batch.set(firestore.doc(path), data, { merge: true });
    await batch.commit();
    const snapshots = await firestore.getAll(...chunk.map(([path]) => firestore.doc(path)));
    for (const snapshot of snapshots) {
      if (!snapshot.exists || !Object.entries(writes.get(snapshot.ref.path)!).every(
        ([key, value]) => isDeepStrictEqual(snapshot.get(key), value),
      )) throw new Error(`Read-back verification failed for ${snapshot.ref.path}.`);
    }
  }
  console.log('Six-group Errand content provisioned and verified.');
}
