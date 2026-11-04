import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import { CHECKPOINTS, protectedPuzzle, variantKey } from '../content/protected.js';
import { PUBLIC_PUZZLES } from '../content/public.js';
import { normaliseAnswer } from '../services/normalise.js';

/** Updates puzzle IV only; preserves release overrides, team bindings, and all earned progress. */
export async function provisionWordPuzzles(firestore: Firestore, apply: boolean): Promise<void> {
  const roster = await firestore.collection('teams').get();
  if (!roster.docs.length) throw new Error('No teams found; provision the roster first.');
  const puzzle = PUBLIC_PUZZLES.find((candidate) => candidate.id === 4)!;
  const secret = protectedPuzzle(4);
  const writes = new Map<string, DocumentData>();
  const teamNumbers = new Set<number>();
  for (const snapshot of roster.docs) {
    const teamNumber = snapshot.get('teamNumber');
    if (!Number.isInteger(teamNumber) || teamNumber < 1 || teamNumbers.has(teamNumber)) {
      throw new Error(`Missing, invalid, or duplicate team number in teams/${snapshot.id}. No changes written.`);
    }
    teamNumbers.add(teamNumber);
    const group = variantKey(teamNumber, Object.keys(puzzle.variants!));
    writes.set(`teamPuzzleContent/${snapshot.id}_4`, {
      teamId: snapshot.id, puzzleId: '4', intro: puzzle.intro,
      blocks: [...puzzle.blocks, ...puzzle.variants![group]],
    });
    secret.hints.forEach((hint, index) => writes.set(`teams/${snapshot.id}/puzzleHints/4_${index + 1}`, {
      puzzleId: '4', hintNumber: index + 1, text: hint.text, penaltyMinutes: hint.penaltyMinutes,
    }));
    writes.set(`teams/${snapshot.id}/puzzleRewards/4`, {
      fragment: secret.fragment, completionMessage: secret.completionMessage,
    });
    console.log(`Team ${snapshot.id}: poster ${group.slice(1)}.`);
  }
  writes.set('privatePuzzles/4', { ...secret, acceptedAnswers: [], acceptedAnswersByGroup: {} });
  const fallback = CHECKPOINTS.find((checkpoint) => checkpoint.puzzleId === 4)!;
  const hash = createHash('sha256').update(normaliseAnswer(fallback.code)).digest('hex');
  writes.set(`checkpoints/${hash}`, { title: fallback.title, message: fallback.message, puzzleId: 4 });
  console.log(`Prepared ${writes.size} puzzle-IV documents for ${roster.docs.length} teams. Progress, schedules, logins, and other puzzles are unchanged.`);
  if (!apply) {
    console.log('Dry run only. Add --apply to write.');
    return;
  }
  const entries = [...writes];
  for (let offset = 0; offset < entries.length; offset += 400) {
    const batch = firestore.batch();
    for (const [path, data] of entries.slice(offset, offset + 400)) {
      batch.set(firestore.doc(path), data, { merge: true });
    }
    await batch.commit();
    const written = await firestore.getAll(...entries.slice(offset, offset + 400).map(([path]) => firestore.doc(path)));
    for (const snapshot of written) {
      const expected = writes.get(snapshot.ref.path)!;
      if (!snapshot.exists || !Object.entries(expected).every(([key, value]) => isDeepStrictEqual(snapshot.get(key), value))) {
        throw new Error(`Read-back verification failed for ${snapshot.ref.path}.`);
      }
    }
  }
  console.log('Puzzle IV word-picture content provisioned.');
}
