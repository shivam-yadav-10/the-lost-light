import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import { protectedPuzzle } from '../content/protected.js';
import { PUBLIC_PUZZLES } from '../content/public.js';
import { teamKey, teamSeal } from '../services/convergence.js';
import { buildOverlayCards, planConvergenceGroups, wordPixels, type ConvergenceAssignment } from '../services/convergenceOverlay.js';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const normalizeSeal = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Targeted, non-destructive cutover. No progress, login, config, or other puzzle content is written. */
export async function provisionConvergence(firestore: Firestore, apply: boolean): Promise<void> {
  const teamsSnapshot = await firestore.collection('teams').get();
  const teams = teamsSnapshot.docs.map((snapshot) => {
    const teamNumber = snapshot.get('teamNumber');
    const teamName = snapshot.get('teamName');
    if (!Number.isInteger(teamNumber) || teamNumber < 1 || typeof teamName !== 'string' || !teamName.trim()) {
      throw new Error(`Invalid roster entry teams/${snapshot.id}.`);
    }
    return { id: snapshot.id, teamNumber: teamNumber as number };
  });
  if (!teams.length) throw new Error('No teams found; provision the roster before Convergence.');
  const [gameDocuments, privateDocuments] = await Promise.all([
    firestore.getAll(...teams.map((team) => firestore.doc(`teamGameData/${team.id}`))),
    firestore.getAll(...teams.map((team) => firestore.doc(`privateTeamData/${team.id}`))),
  ]);
  const gameById = new Map(gameDocuments.map((snapshot) => [snapshot.id, snapshot.data() ?? {}]));
  const privateById = new Map(privateDocuments.map((snapshot) => [snapshot.id, snapshot.data() ?? {}]));
  const existing = new Map<string, ConvergenceAssignment>();
  for (const [id, data] of gameById) {
    if (data.convergence != null) existing.set(id, data.convergence as ConvergenceAssignment);
  }
  const groups = planConvergenceGroups(teams, existing);
  const puzzle = PUBLIC_PUZZLES.find((candidate) => candidate.id === 7)!;
  const secret = protectedPuzzle(7);
  const writes = new Map<string, DocumentData>();
  const groupWrites: Array<Map<string, DocumentData>> = [];
  const seals = new Set<string>();
  for (const members of groups) {
    const cards = buildOverlayCards(members);
    const circleWrites = new Map<string, DocumentData>();
    const circlePixels: number[] = [];
    for (const [index, id] of members.entries()) {
      const team = teams.find((candidate) => candidate.id === id)!;
      const previous = existing.get(id);
      const oldSeal = gameById.get(id)?.shard?.seal;
      const seal = previous?.seal ?? (typeof oldSeal === 'string' ? oldSeal : teamSeal(team.teamNumber));
      const oldKey = privateById.get(id)?.lanternKey;
      if (oldKey != null && (typeof oldKey !== 'string' || !/^\d{6}$/.test(oldKey))) {
        throw new Error(`Invalid existing Vault proof for ${id}; refusing to replace it.`);
      }
      const key = oldKey ?? teamKey(team.teamNumber);
      const assignment: ConvergenceAssignment = previous ?? { version: 2, memberIds: members, seal, card: cards[index] };
      if (typeof seal !== 'string' || !/^SEAL-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(seal)
        || !assignment.card || assignment.card.width !== 31 || assignment.card.height !== 9
        || !Array.isArray(assignment.card.lit) || !assignment.card.lit.length
        || new Set(assignment.card.lit).size !== assignment.card.lit.length
        || !assignment.card.lit.every((pixel) => Number.isInteger(pixel) && pixel >= 0 && pixel < 279)) {
        throw new Error(`Invalid existing convergence card or seal for ${id}; refusing to overwrite it.`);
      }
      const sealHash = hash(normalizeSeal(seal));
      circlePixels.push(...assignment.card.lit);
      if (seals.has(sealHash)) throw new Error('Duplicate team seals in roster.');
      seals.add(sealHash);
      circleWrites.set(`teamGameData/${id}`, { convergence: assignment });
      circleWrites.set(`convergenceSealLookups/${sealHash}`, { version: 2, ownerTeamId: id });
      if (oldKey == null) circleWrites.set(`privateTeamData/${id}`, { lanternKey: key });
      circleWrites.set(`teamPuzzleContent/${id}_7`, {
        teamId: id, puzzleId: '7', intro: puzzle.intro, blocks: puzzle.blocks,
      });
      circleWrites.set(`teams/${id}/puzzleRewards/7`, {
        completionMessage: secret.completionMessage.replace('{key}', key),
      });
      secret.hints.forEach((hint, hintIndex) => circleWrites.set(`teams/${id}/puzzleHints/7_${hintIndex + 1}`, {
        puzzleId: '7', hintNumber: hintIndex + 1, text: hint.text, penaltyMinutes: hint.penaltyMinutes,
      }));
    }
    const dark = wordPixels();
    if (new Set(circlePixels).size !== circlePixels.length || circlePixels.length + dark.size !== 279
      || circlePixels.some((pixel) => dark.has(pixel))) {
      throw new Error(`Persisted masks do not form the intended lantern for circle ${members.join(', ')}; no documents were written.`);
    }
    groupWrites.push(circleWrites);
    for (const [path, data] of circleWrites) writes.set(path, data);
  }
  const { intro: _intro, blocks: _blocks, variants: _variants, ...metadata } = puzzle;
  writes.set('puzzles/7', { ...metadata, unlockAt: null, maxHints: secret.hints.length,
    hintPenalties: secret.hints.map((hint) => hint.penaltyMinutes) });
  writes.set('privatePuzzles/7', { ...secret, acceptedAnswers: secret.answers.map((answer) => answer.toLowerCase()),
    unlockAt: null, requires: puzzle.requires, maxHints: secret.hints.length });
  console.log(`Convergence plan: ${teams.length} teams, ${groups.filter((g) => g.length === 2).length} pairs, ${groups.filter((g) => g.length === 3).length} triples; ${existing.size} existing assignments retained; ${writes.size} targeted document merges.`);
  for (const members of groups) console.log(`  Circle: ${members.join(', ')}`);
  if (!apply) {
    console.log('Read-only plan. No documents written. Progress, hints-used, logins, and Vault proofs are preserved.');
    return;
  }
  // Each circle is atomic, so an interrupted run can resume without half-provisioned partners.
  groupWrites.push(new Map([...writes].filter(([path]) => path === 'puzzles/7' || path === 'privatePuzzles/7')));
  for (const circleWrites of groupWrites) {
    const batch = firestore.batch();
    for (const [path, data] of circleWrites) batch.set(firestore.doc(path), data, { merge: true });
    await batch.commit();
  }
  const expected = [...writes];
  for (let offset = 0; offset < expected.length; offset += 200) {
    const portion = expected.slice(offset, offset + 200);
    const readBack = await firestore.getAll(...portion.map(([path]) => firestore.doc(path)));
    readBack.forEach((snapshot, index) => {
      const data = portion[index][1];
      if (!snapshot.exists || Object.entries(data).some(([key, value]) => !isDeepStrictEqual(snapshot.get(key), value))) {
        throw new Error(`Convergence read-back failed for ${snapshot.ref.path}. Re-run the targeted seed.`);
      }
    });
  }
  console.log('Convergence targeted seed completed and read-back verified. No progress or login documents changed.');
}
