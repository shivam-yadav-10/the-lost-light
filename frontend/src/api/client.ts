import { FirebaseError } from 'firebase/app';
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import type {
  CheckpointResult,
  ConvergenceState,
  FragmentMeta,
  HintResult,
  PuzzleDetail,
  SealResult,
  Spoke,
  SubmitResult,
  SymbolName,
} from './types';
import { initializeSession } from '../services/authService';
import { compactAnswer, hashText, normalizeAnswer, normalizeSeal } from '../services/gameCrypto';
import { GameServicesUnavailableError, requireFirebaseServices } from '../services/firebase';
import {
  assertHintAvailable,
  CORE_QUESTION_SCHEDULE,
  scoringStartAt,
  hintCount,
  isScheduleLocked,
  PUZZLE_IDS,
  puzzleHintLimit,
  puzzleRequirements,
} from '../services/gameRules';
import { checkRiddleAnswers, parseRiddleProof } from '../services/riddleAnswers';
import { checkHiddenWords } from '../services/hiddenWords';
import { readStableContent } from '../services/stableContent';
import { matchesMelody, pianoUnlocked, PIANO_VERSION } from '../services/piano';
import { parseVaultProof } from '../services/hanoi';
import { parseHanoiDraft } from '../services/hanoiProgress';
import { alignmentProof, parseMemberIds, parseOverlayCard } from '../services/convergenceOverlay';
import { checkConvergenceAnswer } from '../services/convergenceAnswer';

const ERROR_STATUS: Record<string, number> = {
  'permission-denied': 403,
  'not-found': 404,
  unavailable: 503,
  'deadline-exceeded': 504,
};

const INCORRECT_ANSWER_MESSAGE = 'That answer does not unlock this fragment. Look again and try once more.';
const FRAGMENT_SYMBOLS = new Set<string>(['star', 'crescent', 'diamond', 'ring', 'flame', 'spiral']);
const LANTERN_SPOKES = new Set<string>(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']);

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type DataRecord = Record<string, unknown>;

function asRecord(value: unknown): DataRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError(503, 'Game data in Firebase is incomplete.');
  }
  return value as DataRecord;
}

function timestampToIso(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Timestamp) return value.toDate().toISOString();
  throw new ApiError(503, 'Game data in Firebase is incomplete.');
}

function firebaseApiError(error: unknown, fallback: string): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof GameServicesUnavailableError) return new ApiError(503, error.message);
  if (error instanceof FirebaseError) {
    return new ApiError(ERROR_STATUS[error.code] ?? 0, error.message || fallback);
  }
  if (error instanceof Error) return new ApiError(0, error.message);
  return new ApiError(0, fallback);
}

function answerForRules(puzzleId: number, rawAnswer: string): string {
  if (puzzleId === 2 || puzzleId === 5) return compactAnswer(rawAnswer);
  return normalizeAnswer(rawAnswer);
}

function requiredString(record: DataRecord, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiError(503, 'Game data in Firebase is incomplete.');
  }
  return value;
}

function isSymbolName(value: unknown): value is SymbolName {
  return typeof value === 'string' && FRAGMENT_SYMBOLS.has(value);
}

function isSpoke(value: unknown): value is Spoke {
  return typeof value === 'string' && LANTERN_SPOKES.has(value);
}

function parseFragment(value: unknown): FragmentMeta | null {
  if (value == null) return null;
  const record = asRecord(value);
  if (
    !isSymbolName(record.symbol) ||
    !isSpoke(record.direction) ||
    typeof record.number !== 'number' ||
    !Number.isInteger(record.number) ||
    record.number < 1
  ) {
    throw new ApiError(503, 'Fragment data in Firebase is incomplete.');
  }
  return {
    symbol: record.symbol,
    number: record.number,
    direction: record.direction,
    keyword: requiredString(record, 'keyword'),
    colour: requiredString(record, 'colour'),
  };
}

function parseCircle(value: unknown, ownId: string) {
  const record = asRecord(value);
  if (record.version !== 2) throw new ApiError(503, 'Your lantern circle has not been provisioned.');
  const clue = asRecord(record.clue);
  return {
    memberIds: parseMemberIds(record.memberIds, ownId),
    seal: requiredString(record, 'seal'),
    card: parseOverlayCard(record.card),
    riddleSet: requiredString(record, 'riddleSet'),
    clue: {
      title: requiredString(clue, 'title'), text: requiredString(clue, 'text'),
      detail: requiredString(clue, 'detail'), art: requiredString(clue, 'art'),
    },
  };
}

function puzzleReference(teamDocId: string, puzzleId: number) {
  const { firestore } = requireFirebaseServices();
  return doc(firestore, 'teams', teamDocId, 'progress', String(puzzleId));
}

/**
 * The game engine now runs client-side: Firestore Rules only require a signed-in
 * user. This mirrors the schedule/prerequisite gating that used to live in Rules.
 */
async function isPuzzleOpen(
  firestore: ReturnType<typeof requireFirebaseServices>['firestore'],
  teamRef: ReturnType<typeof doc>,
  puzzleId: number,
  metadata: DataRecord,
): Promise<boolean> {
  const configSnapshot = await getDoc(doc(firestore, 'gameConfig', 'main'));
  const config = configSnapshot.exists() ? asRecord(configSnapshot.data()) : {};
  const overrides = config.unlockOverrides && typeof config.unlockOverrides === 'object' && !Array.isArray(config.unlockOverrides)
    ? config.unlockOverrides as DataRecord
    : {};
  const overrideValue = overrides[String(puzzleId)];
  const now = Date.now();
  const hasMetadataSchedule = metadata.unlockAt == null || metadata.unlockAt instanceof Timestamp;
  if (!(overrideValue instanceof Timestamp) && !hasMetadataSchedule) {
    throw new ApiError(503, 'Puzzle release schedule is incomplete.');
  }
  const releaseAt = overrideValue instanceof Timestamp
    ? overrideValue.toDate().toISOString()
    : metadata.unlockAt instanceof Timestamp
      ? metadata.unlockAt.toDate().toISOString()
      : null;
  const released = !isScheduleLocked(releaseAt, now);
  if (!released) return false;

  if (!Array.isArray(metadata.requires) || !metadata.requires.every((id) => Number.isInteger(id) && id > 0)) {
    throw new ApiError(503, 'Puzzle prerequisites are incomplete.');
  }
  const requires = puzzleRequirements(puzzleId, metadata.requires);
  if (requires.length === 0) return true;
  const progressSnapshots = await Promise.all(
    requires.map((requiredId) => getDoc(doc(teamRef, 'progress', String(requiredId)))),
  );
  return progressSnapshots.every((snapshot) => snapshot.exists() && snapshot.get('status') === 'solved');
}

async function isAnswerCorrect(
  firestore: ReturnType<typeof requireFirebaseServices>['firestore'],
  teamDocId: string,
  teamRef: ReturnType<typeof doc>,
  puzzleId: number,
  rawAnswer: string,
  rawProof: string | undefined,
): Promise<boolean> {
  const secretSnapshot = await getDoc(doc(firestore, 'privatePuzzles', String(puzzleId)));
  if (!secretSnapshot.exists()) throw new ApiError(503, 'Puzzle answer data is missing from Firebase.');
  const secret = asRecord(secretSnapshot.data());
  const answer = answerForRules(puzzleId, rawAnswer);
  const acceptedAnswers = Array.isArray(secret.acceptedAnswers) ? secret.acceptedAnswers as unknown[] : [];

  if (puzzleId === 4) {
    const teamSnapshot = await getDoc(teamRef);
    const teamNumber = teamSnapshot.get('teamNumber');
    if (!Number.isInteger(teamNumber) || teamNumber < 1) throw new ApiError(503, 'Your team number is missing.');
    const group = `W${((teamNumber - 1) % 9) + 1}`;
    const byGroup = asRecord(secret.hiddenWordsByGroup);
    return checkHiddenWords(rawAnswer, byGroup[group]);
  }

  if (puzzleId === 7) {
    await validateConvergenceSubmission(teamDocId, rawProof);
    const circle = parseCircle((await getDoc(doc(firestore, 'teamGameData', teamDocId))).get('convergence'), teamDocId);
    return checkConvergenceAnswer(rawAnswer, asRecord(secret.convergenceAnswersBySet)[circle.riddleSet], secret.overlayWord);
  }
  if (puzzleId === 8) {
    const proof = parseVaultProof(rawProof);
    const privateTeam = await getDoc(doc(firestore, 'privateTeamData', teamDocId));
    const key = privateTeam.get('lanternKey');
    return acceptedAnswers.includes(answer) && typeof key === 'string' && proof.code === key;
  }
  if (puzzleId === 2 || puzzleId === 5) {
    const teamSnapshot = await getDoc(teamRef);
    const team = asRecord(teamSnapshot.data());
    const byGroup = secret.acceptedAnswersByGroup && typeof secret.acceptedAnswersByGroup === 'object'
      ? secret.acceptedAnswersByGroup as DataRecord
      : {};
    const groupKey = puzzleId === 2 ? team.errandGroup : team.riddleSet;
    const groupAnswers = typeof groupKey === 'string' && Array.isArray(byGroup[groupKey]) ? byGroup[groupKey] as unknown[] : [];
    if (puzzleId === 5) {
      const expected = asRecord(secret.riddleAnswersByGroup);
      if (typeof groupKey !== 'string' || !checkRiddleAnswers(parseRiddleProof(rawProof), expected[groupKey]).every(Boolean)) {
        throw new ApiError(400, 'Solve and check all five day riddles before offering the final word.');
      }
    }
    return groupAnswers.includes(answer);
  }
  return acceptedAnswers.includes(answer);
}

async function validateConvergenceSubmission(
  ownId: string,
  proof: string | undefined,
  transaction?: Parameters<Parameters<typeof runTransaction>[1]>[0],
): Promise<void> {
  const { firestore } = requireFirebaseServices();
  const read = (reference: ReturnType<typeof doc>) => transaction ? transaction.get(reference) : getDoc(reference);
  const own = await read(doc(firestore, 'teamGameData', ownId));
  const circle = parseCircle(own.get('convergence'), ownId);
  alignmentProof(proof, circle.memberIds, ownId);
  for (const partnerId of circle.memberIds.filter((id) => id !== ownId)) {
    const [partner, seal, arrival, progress] = await Promise.all([
      read(doc(firestore, 'teamGameData', partnerId)),
      read(doc(firestore, 'teams', ownId, 'convergenceSeals', partnerId)),
      read(doc(firestore, 'teams', partnerId, 'convergence', 'arrival')),
      read(doc(firestore, 'teams', partnerId, 'progress', '7')),
    ]);
    const partnerCircle = parseCircle(partner.get('convergence'), partnerId);
    if (partnerCircle.riddleSet !== circle.riddleSet
      || JSON.stringify(partnerCircle.memberIds) !== JSON.stringify(circle.memberIds)
      || !seal.exists() || seal.get('version') !== 2
      || seal.get('sealHash') !== await hashText(normalizeSeal(partnerCircle.seal))
      || (!arrival.exists() && progress.get('status') !== 'solved')) {
      throw new ApiError(400, 'Every partner must arrive and have their seal verified before offering the word.');
    }
  }
}

async function loadPuzzleDetail(teamDocId: string, teamNumber: number, puzzleId: number): Promise<PuzzleDetail> {
  const { firestore } = requireFirebaseServices();
  await initializeSession();
  const teamRef = doc(firestore, 'teams', teamDocId);
  const progressRef = doc(teamRef, 'progress', String(puzzleId));
  const contentRef = doc(firestore, 'teamPuzzleContent', `${teamDocId}_${puzzleId}`);
  const [metadataSnapshot, teamSnapshot, progressSnapshot, contentSnapshot] = await Promise.all([
    getDoc(doc(firestore, 'puzzles', String(puzzleId))),
    getDoc(teamRef),
    getDoc(progressRef),
    readStableContent(contentRef),
  ]);
  if (!metadataSnapshot.exists() || !teamSnapshot.exists() || !contentSnapshot.exists()) {
    throw new ApiError(404, 'Puzzle not found.');
  }
  if (teamSnapshot.get('teamNumber') !== teamNumber) throw new ApiError(403, 'This team is no longer linked to this device.');

  const metadata = asRecord(metadataSnapshot.data());
  const progress = progressSnapshot.exists() ? asRecord(progressSnapshot.data()) : {};
  const solved = progress.status === 'solved';
  if (!solved && !(await isPuzzleOpen(firestore, teamRef, puzzleId, metadata))) {
    throw new ApiError(423, 'This fragment is still hidden.');
  }
  const content = asRecord(contentSnapshot.data());
  const solvedAt = timestampToIso(progress.solvedAt);
  const hintsUsed = typeof progress.hintsUsed === 'number' ? progress.hintsUsed : 0;
  const maxHints = puzzleHintLimit(metadata.maxHints);
  if (puzzleId === 3 && !pianoUnlocked(progress)) {
    return {
      id: puzzleId, slug: String(metadata.slug ?? ''), title: String(metadata.title ?? ''),
      fragmentName: String(metadata.fragmentName ?? ''), kind: metadata.kind as PuzzleDetail['kind'],
      sortOrder: Number(metadata.sortOrder), state: 'AVAILABLE', unlockAt: timestampToIso(metadata.unlockAt),
      solvedAt: null, hintsUsed, maxHints, intro: '', blocks: [], revealedHints: [],
      fragment: null, completionMessage: null, pianoUnlocked: false,
    };
  }
  const hints = await Promise.all(
    Array.from({ length: hintsUsed }, (_, index) =>
      readStableContent(doc(teamRef, 'puzzleHints', `${puzzleId}_${index + 1}`)),
    ),
  );
  const earnedSnapshot = solved
    ? await readStableContent(doc(teamRef, 'puzzleRewards', String(puzzleId)))
    : null;
  const earnedData = earnedSnapshot?.exists() ? asRecord(earnedSnapshot.data()) : null;
  let completionMessage = typeof earnedData?.completionMessage === 'string' ? earnedData.completionMessage : null;
  if (solved && puzzleId === 7) {
    const privateTeam = await getDoc(doc(firestore, 'privateTeamData', teamDocId));
    const key = privateTeam.get('lanternKey');
    if (typeof key !== 'string') throw new ApiError(503, 'Convergence data is not provisioned.');
    completionMessage = completionMessage?.replace('{key}', key) ?? null;
  }

  return {
    id: puzzleId,
    ...(puzzleId === 3 ? { pianoUnlocked: true } : {}),
    slug: String(metadata.slug ?? ''),
    title: String(metadata.title ?? ''),
    fragmentName: String(metadata.fragmentName ?? ''),
    kind: metadata.kind as PuzzleDetail['kind'],
    sortOrder: Number(metadata.sortOrder),
    state: solved ? 'SOLVED' : 'AVAILABLE',
    unlockAt: timestampToIso(metadata.unlockAt),
    solvedAt,
    hintsUsed,
    maxHints,
    intro: String(content.intro ?? ''),
    blocks: Array.isArray(content.blocks) ? content.blocks as PuzzleDetail['blocks'] : [],
    revealedHints: hints.map((snapshot) => {
      if (!snapshot.exists() || typeof snapshot.get('text') !== 'string') {
        throw new ApiError(503, 'A revealed hint is missing from Firebase.');
      }
      return snapshot.get('text') as string;
    }),
    fragment: parseFragment(earnedData?.fragment),
    completionMessage,
  };
}

async function hintDocuments(teamDocId: string, puzzleId: number, hintsUsed: number): Promise<string[]> {
  const { firestore } = requireFirebaseServices();
  const teamRef = doc(firestore, 'teams', teamDocId);
  const snapshots = await Promise.all(
    Array.from({ length: hintsUsed }, (_, index) =>
      readStableContent(doc(teamRef, 'puzzleHints', `${puzzleId}_${index + 1}`)),
    ),
  );
  return snapshots.map((snapshot) => {
    const text = snapshot.get('text');
    if (!snapshot.exists() || typeof text !== 'string') throw new ApiError(503, 'A revealed hint is missing from Firebase.');
    return text;
  });
}

export const api = {
  unlockPiano: async (teamDocId: string, notes: string[]): Promise<void> => {
    if (!teamDocId.trim() || !matchesMelody(teamDocId, notes)) {
      throw new ApiError(400, 'Replay your team’s complete melody in order.');
    }
    try {
      const { firestore } = requireFirebaseServices();
      await initializeSession();
      const teamRef = doc(firestore, 'teams', teamDocId);
      const metadata = await getDoc(doc(firestore, 'puzzles', '3'));
      if (!metadata.exists()) throw new ApiError(404, 'Puzzle not found.');
      if (!(await isPuzzleOpen(firestore, teamRef, 3, asRecord(metadata.data())))) {
        throw new ApiError(423, 'This fragment is still hidden.');
      }
      await runTransaction(firestore, async (transaction) => {
        const ref = puzzleReference(teamDocId, 3);
        const snapshot = await transaction.get(ref);
        const progress = snapshot.data() ?? {};
        if (pianoUnlocked(progress)) return;
        transaction.set(ref, { pianoVersion: PIANO_VERSION, pianoCompletedAt: serverTimestamp() }, { merge: true });
      });
    } catch (error) { throw firebaseApiError(error, 'Could not save your melody.'); }
  },
  checkRiddles: async (teamDocId: string, answers: string[]): Promise<boolean[]> => {
    try {
      const { firestore } = requireFirebaseServices();
      await initializeSession();
      const [team, secret] = await Promise.all([
        getDoc(doc(firestore, 'teams', teamDocId)),
        getDoc(doc(firestore, 'privatePuzzles', '5')),
      ]);
      const group = team.get('riddleSet');
      const expected = asRecord(secret.get('riddleAnswersByGroup'));
      if (typeof group !== 'string') throw new ApiError(503, 'The team riddle set is missing.');
      return checkRiddleAnswers(answers, expected[group]);
    } catch (error) {
      throw firebaseApiError(error, 'Could not check the five day answers.');
    }
  },
  status: async () => {
    const { firestore } = requireFirebaseServices();
    await initializeSession();
    const config = await getDoc(doc(firestore, 'gameConfig', 'main'));
    if (!config.exists()) throw new ApiError(503, 'Game configuration is missing from Firebase.');
    return {
      name: 'The Lost Light',
      serverTime: new Date().toISOString(),
      eventDate: config.get('eventDate') ?? '2026-11-10',
      timezone: 'Asia/Kolkata',
      scheduleStartAt: scoringStartAt(timestampToIso(config.get('scheduleStartAt')), timestampToIso(config.get('testScoringStartAt'))),
      questionSchedule: CORE_QUESTION_SCHEDULE,
      scoringRule: 'elapsed-from-schedule-start-plus-hint-penalties',
    };
  },

  puzzle: async (id: number, teamDocId: string, teamNumber: number) => {
    if (!Number.isInteger(id) || id < 1 || !teamDocId.trim()) throw new ApiError(400, 'Invalid puzzle.');
    try {
      return await loadPuzzleDetail(teamDocId, teamNumber, id);
    } catch (error) {
      if (error instanceof FirebaseError && error.code === 'permission-denied') {
        throw new ApiError(423, 'This fragment is still hidden.');
      }
      throw firebaseApiError(error, 'Could not load this fragment.');
    }
  },

  submit: async (id: number, teamDocId: string, teamNumber: number, answer: string, proof?: string): Promise<SubmitResult> => {
    if (!Number.isInteger(id) || id < 1 || !teamDocId.trim() || !answer.trim()) throw new ApiError(400, 'Enter an answer first.');
    try {
      const loaded = await loadPuzzleDetail(teamDocId, teamNumber, id);
      if (id === 3 && !loaded.pianoUnlocked) throw new ApiError(423, 'Replay your team’s melody before opening Question III.');
      const { firestore } = requireFirebaseServices();
      await initializeSession();
      const teamRef = doc(firestore, 'teams', teamDocId);
      const correct = await isAnswerCorrect(firestore, teamDocId, teamRef, id, answer, proof);
      if (!correct) throw new ApiError(400, INCORRECT_ANSWER_MESSAGE);
      const vaultProof = id === 8 ? parseVaultProof(proof) : null;
      const progressRef = puzzleReference(teamDocId, id);
      const result = await runTransaction(firestore, async (transaction) => {
        const progressSnapshot = await transaction.get(progressRef);
        const progress = progressSnapshot.exists() ? progressSnapshot.data() : {};
        if (progress.status === 'solved') throw new ApiError(409, 'This fragment has already been solved.');
        if (id === 3 && !pianoUnlocked(progress)) throw new ApiError(423, 'Replay your team’s melody before opening Question III.');
        if (vaultProof && progress.hanoiDraft !== undefined
          && parseHanoiDraft(progress.hanoiDraft).moves !== vaultProof.moves) {
          throw new ApiError(409, 'Your team changed the tower. Load the saved tower before opening the Vault.');
        }
        if (id === 7) await validateConvergenceSubmission(teamDocId, proof, transaction);
        const now = serverTimestamp();
        const data = {
          status: 'solved',
          hintsUsed: typeof progress.hintsUsed === 'number' ? progress.hintsUsed : 0,
          startedAt: progress.startedAt ?? now,
          solvedAt: now,
          answer: answerForRules(id, answer),
          ...(id === 3 ? { pianoVersion: PIANO_VERSION, pianoCompletedAt: progress.pianoCompletedAt ?? now } : {}),
          ...(vaultProof ? { proof: vaultProof.code, hanoiMoves: vaultProof.moves } : {}),
        };
        transaction.set(progressRef, data);
        return data.hintsUsed;
      });
      const detail = await loadPuzzleDetail(teamDocId, teamNumber, id);
      window.dispatchEvent(new Event('lostlight:progress-updated'));
      return {
        correct: true,
        message: detail.completionMessage ?? 'The fragment is yours.',
        fragment: detail.fragment,
        puzzle: {
          id: detail.id,
          slug: detail.slug,
          title: detail.title,
          fragmentName: detail.fragmentName,
          kind: detail.kind,
          sortOrder: detail.sortOrder,
          state: 'SOLVED',
          unlockAt: detail.unlockAt,
          solvedAt: detail.solvedAt,
          hintsUsed: result,
          maxHints: detail.maxHints,
        },
      };
    } catch (error) {
      throw firebaseApiError(error, 'Could not submit that answer.');
    }
  },

  hint: async (id: number, teamDocId: string): Promise<HintResult> => {
    if (!Number.isInteger(id) || id < 1 || !teamDocId.trim()) throw new ApiError(400, 'Invalid puzzle.');
    try {
      const { firestore } = requireFirebaseServices();
      await initializeSession();
      const teamRef = doc(firestore, 'teams', teamDocId);
      const metadataSnapshot = await getDoc(doc(firestore, 'puzzles', String(id)));
      if (!metadataSnapshot.exists()) throw new ApiError(404, 'Puzzle not found.');
      const metadata = asRecord(metadataSnapshot.data());
      if (!(await isPuzzleOpen(firestore, teamRef, id, metadata))) {
        throw new ApiError(423, 'This fragment is still hidden or no hints remain.');
      }
      const maxHints = puzzleHintLimit(metadata.maxHints);
      const progressRef = puzzleReference(teamDocId, id);
      const result = await runTransaction(firestore, async (transaction) => {
        // Reading every progress record makes concurrent hints on different questions conflict and retry.
        const snapshots = await Promise.all(PUZZLE_IDS.map((puzzleId) =>
          transaction.get(puzzleReference(teamDocId, puzzleId)),
        ));
        const progressSnapshot = snapshots.find((snapshot) => snapshot.id === String(id));
        if (!progressSnapshot) throw new ApiError(400, 'Invalid puzzle.');
        const progress = progressSnapshot.exists() ? progressSnapshot.data() : {};
        if (progress.status === 'solved') throw new ApiError(409, 'This fragment has already been solved.');
        if (id === 3 && !pianoUnlocked(progress)) throw new ApiError(423, 'Replay your team’s melody before requesting Question III hints.');
        const used = hintCount(progress.hintsUsed);
        const teamHintsUsed = snapshots.reduce((sum, snapshot) => sum + hintCount(snapshot.data()?.hintsUsed), 0);
        try {
          assertHintAvailable(used, teamHintsUsed, maxHints);
        } catch (error) {
          throw new ApiError(409, error instanceof Error ? error.message : 'No hints remain.');
        }
        const nextCount = used + 1;
        const nextHint = await transaction.get(doc(teamRef, 'puzzleHints', `${id}_${nextCount}`));
        if (!nextHint.exists() || typeof nextHint.get('text') !== 'string') {
          throw new ApiError(503, 'The next hint is missing from Firebase.');
        }
        const now = serverTimestamp();
        transaction.set(progressRef, {
          status: 'in_progress',
          hintsUsed: nextCount,
          startedAt: progress.startedAt ?? now,
          solvedAt: null,
        }, { merge: true });
        return { hintsUsed: nextCount, teamHintsUsed: teamHintsUsed + 1 };
      });
      window.dispatchEvent(new Event('lostlight:progress-updated'));
      return { ...result, maxHints, hints: await hintDocuments(teamDocId, id, result.hintsUsed) };
    } catch (error) {
      throw firebaseApiError(error, 'Could not reveal a hint.');
    }
  },

  checkpoint: async (teamDocId: string, code: string): Promise<CheckpointResult> => {
    if (!teamDocId.trim() || !code.trim()) throw new ApiError(400, 'Enter a checkpoint code.');
    try {
      const { firestore } = requireFirebaseServices();
      await initializeSession();
      const checkpointHash = await hashText(normalizeAnswer(code));
      const checkpointRef = doc(firestore, 'checkpoints', checkpointHash);
      const checkpoint = await getDoc(checkpointRef);
      if (!checkpoint.exists()) throw new ApiError(404, 'No marker answers to that code.');
      const visitRef = doc(firestore, 'teams', teamDocId, 'checkpointVisits', checkpointHash);
      const existingVisit = await getDoc(visitRef);
      if (existingVisit.exists()) {
        return {
          title: String(checkpoint.get('title')),
          message: String(checkpoint.get('message')),
          puzzleId: typeof checkpoint.get('puzzleId') === 'number' ? checkpoint.get('puzzleId') : null,
          alreadyVisited: true,
        };
      }
      await setDoc(visitRef, { code: code.trim(), title: checkpoint.get('title'), visitedAt: serverTimestamp() });
      return {
        title: String(checkpoint.get('title')),
        message: String(checkpoint.get('message')),
        puzzleId: typeof checkpoint.get('puzzleId') === 'number' ? checkpoint.get('puzzleId') : null,
        alreadyVisited: false,
      };
    } catch (error) {
      throw firebaseApiError(error, 'Could not claim that marker.');
    }
  },

  convergence: async (teamDocId: string): Promise<ConvergenceState> => {
    try {
      const { firestore } = requireFirebaseServices();
      await initializeSession();
      const teamRef = doc(firestore, 'teams', teamDocId);
      const [metadata, progress, teamData, verified] = await Promise.all([
        getDoc(doc(firestore, 'puzzles', '7')),
        getDoc(doc(teamRef, 'progress', '7')),
        getDoc(doc(firestore, 'teamGameData', teamDocId)),
        getDocs(collection(teamRef, 'convergenceSeals')),
      ]);
      if (!metadata.exists() || (progress.get('status') !== 'solved'
        && !(await isPuzzleOpen(firestore, teamRef, 7, asRecord(metadata.data()))))) {
        throw new ApiError(423, 'This chamber is still sealed.');
      }
      const circle = parseCircle(teamData.get('convergence'), teamDocId);
      const arrivalRef = doc(teamRef, 'convergence', 'arrival');
      await runTransaction(firestore, async (transaction) => {
        const arrival = await transaction.get(arrivalRef);
        if (!arrival.exists()) transaction.set(arrivalRef, { reachedAt: serverTimestamp(), version: 2 });
      });
      const partners = await Promise.all(circle.memberIds.filter((id) => id !== teamDocId).map(async (partnerId) => {
        const [team, data, arrival, partnerProgress] = await Promise.all([
          getDoc(doc(firestore, 'teams', partnerId)),
          getDoc(doc(firestore, 'teamGameData', partnerId)),
          getDoc(doc(firestore, 'teams', partnerId, 'convergence', 'arrival')),
          getDoc(doc(firestore, 'teams', partnerId, 'progress', '7')),
        ]);
        const partnerCircle = parseCircle(data.get('convergence'), partnerId);
        if (partnerCircle.riddleSet !== circle.riddleSet
          || JSON.stringify(partnerCircle.memberIds) !== JSON.stringify(circle.memberIds)) {
          throw new ApiError(503, 'Your lantern circle is inconsistent. Ask a Keeper.');
        }
        const arrived = arrival.exists() || partnerProgress.get('status') === 'solved';
        const verifiedSeal = verified.docs.find((snapshot) => snapshot.id === partnerId);
        const isVerified = arrived && verifiedSeal?.get('version') === 2
          && verifiedSeal.get('sealHash') === await hashText(normalizeSeal(partnerCircle.seal));
        return {
          teamId: partnerId, name: requiredString(asRecord(team.data()), 'teamName'), arrived,
          verified: Boolean(isVerified), card: isVerified ? partnerCircle.card : null,
          clueIndex: isVerified ? circle.memberIds.indexOf(partnerId) : null,
          clue: isVerified ? partnerCircle.clue : null,
        };
      }));
      return {
        ownId: teamDocId, seal: circle.seal, card: circle.card, partners,
        clueIndex: circle.memberIds.indexOf(teamDocId),
        clue: circle.clue,
      };
    } catch (error) {
      throw firebaseApiError(error, 'The lantern will not light.');
    }
  },

  verifySeal: async (teamDocId: string, rawSeal: string): Promise<SealResult> => {
    if (!teamDocId.trim() || !rawSeal.trim() || rawSeal.length > 40) throw new ApiError(400, 'Enter a seal of at most 40 characters.');
    try {
      const { firestore } = requireFirebaseServices();
      await initializeSession();
      const teamRef = doc(firestore, 'teams', teamDocId);
      const metadataSnapshot = await getDoc(doc(firestore, 'puzzles', '7'));
      if (!metadataSnapshot.exists() || !(await isPuzzleOpen(firestore, teamRef, 7, asRecord(metadataSnapshot.data())))) {
        throw new ApiError(423, 'The lantern is still hidden.');
      }
      const sealHash = await hashText(normalizeSeal(rawSeal));
      const lookup = await getDoc(doc(firestore, 'convergenceSealLookups', sealHash));
      if (!lookup.exists()) throw new ApiError(404, 'That seal is false, or belongs to no one yet.');
      const partnerId = requiredString(asRecord(lookup.data()), 'ownerTeamId');
      const verifiedRef = doc(teamRef, 'convergenceSeals', partnerId);
      return await runTransaction(firestore, async (transaction) => {
        const [own, partner, partnerTeam, arrival, partnerProgress, verified] = await Promise.all([
          transaction.get(doc(firestore, 'teamGameData', teamDocId)),
          transaction.get(doc(firestore, 'teamGameData', partnerId)),
          transaction.get(doc(firestore, 'teams', partnerId)),
          transaction.get(doc(firestore, 'teams', partnerId, 'convergence', 'arrival')),
          transaction.get(doc(firestore, 'teams', partnerId, 'progress', '7')),
          transaction.get(verifiedRef),
        ]);
        const ownCircle = parseCircle(own.get('convergence'), teamDocId);
        const partnerCircle = parseCircle(partner.get('convergence'), partnerId);
        if (partnerId === teamDocId || !ownCircle.memberIds.includes(partnerId)
          || JSON.stringify(ownCircle.memberIds) !== JSON.stringify(partnerCircle.memberIds)
          || await hashText(normalizeSeal(partnerCircle.seal)) !== sealHash) {
          throw new ApiError(400, 'That seal is not from a partner in your circle.');
        }
        if (!arrival.exists() && partnerProgress.get('status') !== 'solved') {
          throw new ApiError(423, 'Your partner must reach the Convergence before their seal can be accepted.');
        }
        const alreadyHeld = verified.get('version') === 2 && verified.get('sealHash') === sealHash;
        if (!alreadyHeld) transaction.set(verifiedRef, { version: 2, sealHash, verifiedAt: serverTimestamp() });
        return { partnerName: requiredString(asRecord(partnerTeam.data()), 'teamName'), alreadyHeld };
      });
    } catch (error) {
      throw firebaseApiError(error, 'Could not verify that seal.');
    }
  },
};
