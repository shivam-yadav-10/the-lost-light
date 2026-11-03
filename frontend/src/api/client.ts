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
  LanternCell,
  PuzzleDetail,
  SealResult,
  ShardRule,
  Spoke,
  SubmitResult,
  SymbolName,
} from './types';
import { initializeSession } from '../services/authService';
import { compactAnswer, hashText, normalizeAnswer, normalizeSeal } from '../services/gameCrypto';
import { GameServicesUnavailableError, requireFirebaseServices } from '../services/firebase';
import { assertHintAvailable, hintCount, PUZZLE_IDS, puzzleHintLimit, puzzleRequirements } from '../services/gameRules';
import { checkRiddleAnswers, parseRiddleProof } from '../services/riddleAnswers';

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
  if (puzzleId === 7) return rawAnswer.replace(/\D/g, '');
  if (puzzleId === 2 || puzzleId === 5) return compactAnswer(rawAnswer);
  return normalizeAnswer(rawAnswer);
}

function digitString(value: string): string {
  return value.replace(/\D/g, '');
}

function requiredString(record: DataRecord, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiError(503, 'Game data in Firebase is incomplete.');
  }
  return value;
}

function isShardType(value: unknown): value is ShardRule['type'] {
  return value === 'A' || value === 'B' || value === 'C' || value === 'D';
}

function isSymbolName(value: unknown): value is SymbolName {
  return typeof value === 'string' && FRAGMENT_SYMBOLS.has(value);
}

function isSpoke(value: unknown): value is Spoke {
  return typeof value === 'string' && LANTERN_SPOKES.has(value);
}

function parseShardRule(value: unknown): ShardRule {
  const record = asRecord(value);
  if (!isShardType(record.type)) throw new ApiError(503, 'Convergence data in Firebase is incomplete.');
  return { type: record.type, name: requiredString(record, 'name'), text: requiredString(record, 'text') };
}

function parseShard(value: unknown): ConvergenceState['shard'] {
  const record = asRecord(value);
  return { ...parseShardRule(record), seal: requiredString(record, 'seal') };
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

function parseLantern(value: unknown): LanternCell[] {
  if (!Array.isArray(value)) throw new ApiError(503, 'Lantern data in Firebase is incomplete.');
  return value.map((cell) => {
    const record = asRecord(cell);
    if (
      !isSpoke(record.spoke) ||
      typeof record.ring !== 'number' ||
      !Number.isInteger(record.ring) ||
      record.ring < 1 ||
      typeof record.flame !== 'number' ||
      !Number.isInteger(record.flame) ||
      typeof record.shadow !== 'number' ||
      !Number.isInteger(record.shadow) ||
      !isSymbolName(record.mark)
    ) {
      throw new ApiError(503, 'Lantern data in Firebase is incomplete.');
    }
    return {
      spoke: record.spoke,
      ring: record.ring,
      flame: record.flame,
      shadow: record.shadow,
      mark: record.mark,
    };
  });
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
  const released = overrideValue instanceof Timestamp
    ? overrideValue.toMillis() <= now
    : metadata.unlockAt == null || (metadata.unlockAt instanceof Timestamp && metadata.unlockAt.toMillis() <= now);
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

  if (puzzleId === 7) {
    const privateTeam = await getDoc(doc(firestore, 'privateTeamData', teamDocId));
    const key = privateTeam.get('lanternKey');
    return typeof key === 'string' && answer === key;
  }
  if (puzzleId === 8) {
    const privateTeam = await getDoc(doc(firestore, 'privateTeamData', teamDocId));
    const key = privateTeam.get('lanternKey');
    return acceptedAnswers.includes(answer) && typeof key === 'string' && digitString(rawProof ?? '') === key;
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
    getDoc(contentRef),
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
  const hints = await Promise.all(
    Array.from({ length: hintsUsed }, (_, index) =>
      getDoc(doc(teamRef, 'puzzleHints', `${puzzleId}_${index + 1}`)),
    ),
  );
  const earnedSnapshot = solved
    ? await getDoc(doc(teamRef, 'puzzleRewards', String(puzzleId)))
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
      getDoc(doc(teamRef, 'puzzleHints', `${puzzleId}_${index + 1}`)),
    ),
  );
  return snapshots.map((snapshot) => {
    const text = snapshot.get('text');
    if (!snapshot.exists() || typeof text !== 'string') throw new ApiError(503, 'A revealed hint is missing from Firebase.');
    return text;
  });
}

export const api = {
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
  status: async () => ({ name: 'The Lost Light', serverTime: new Date().toISOString(), eventDate: '2026-11-10' }),

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
      await loadPuzzleDetail(teamDocId, teamNumber, id);
      const { firestore } = requireFirebaseServices();
      await initializeSession();
      const teamRef = doc(firestore, 'teams', teamDocId);
      const correct = await isAnswerCorrect(firestore, teamDocId, teamRef, id, answer, proof);
      if (!correct) throw new ApiError(400, INCORRECT_ANSWER_MESSAGE);
      const progressRef = puzzleReference(teamDocId, id);
      const result = await runTransaction(firestore, async (transaction) => {
        const progressSnapshot = await transaction.get(progressRef);
        const progress = progressSnapshot.exists() ? progressSnapshot.data() : {};
        if (progress.status === 'solved') throw new ApiError(409, 'This fragment has already been solved.');
        const now = serverTimestamp();
        const data = {
          status: 'solved',
          hintsUsed: typeof progress.hintsUsed === 'number' ? progress.hintsUsed : 0,
          startedAt: progress.startedAt ?? now,
          solvedAt: now,
          answer: answerForRules(id, answer),
          ...(id === 8 ? { proof: digitString(proof ?? '') } : {}),
        };
        transaction.set(progressRef, data);
        return data.hintsUsed;
      });
      const detail = await loadPuzzleDetail(teamDocId, teamNumber, id);
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
        });
        return { hintsUsed: nextCount, teamHintsUsed: teamHintsUsed + 1 };
      });
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
      const [teamData, verified] = await Promise.all([
        getDoc(doc(firestore, 'teamGameData', teamDocId)),
        getDocs(collection(firestore, 'teams', teamDocId, 'verifiedShards')),
      ]);
      if (!teamData.exists()) throw new ApiError(503, 'Convergence data is not provisioned.');
      const verifiedShards = verified.docs.map((snapshot) => parseShardRule(snapshot.data()));
      return {
        shard: parseShard(teamData.get('shard')),
        verified: verifiedShards,
        lantern: parseLantern(teamData.get('lantern')),
      };
    } catch (error) {
      throw firebaseApiError(error, 'The lantern will not light.');
    }
  },

  verifySeal: async (teamDocId: string, rawSeal: string): Promise<SealResult> => {
    if (!teamDocId.trim() || !rawSeal.trim()) throw new ApiError(400, 'Enter a seal.');
    try {
      const { firestore } = requireFirebaseServices();
      await initializeSession();
      const teamRef = doc(firestore, 'teams', teamDocId);
      const metadataSnapshot = await getDoc(doc(firestore, 'puzzles', '7'));
      if (!metadataSnapshot.exists() || !(await isPuzzleOpen(firestore, teamRef, 7, asRecord(metadataSnapshot.data())))) {
        throw new ApiError(423, 'The lantern is still hidden.');
      }
      const sealHash = await hashText(normalizeSeal(rawSeal));
      const lookup = await getDoc(doc(firestore, 'sealLookups', sealHash));
      if (!lookup.exists()) throw new ApiError(404, 'That seal is false, or belongs to no one yet.');
      const shard = parseShardRule(lookup.data());
      const verifiedRef = doc(firestore, 'teams', teamDocId, 'verifiedShards', shard.type);
      const verified = await getDoc(verifiedRef);
      if (verified.exists()) return { shard, alreadyHeld: true };
      await setDoc(verifiedRef, {
        ...shard,
        sealHash,
        verifiedAt: serverTimestamp(),
      });
      return { shard, alreadyHeld: false };
    } catch (error) {
      throw firebaseApiError(error, 'Could not verify that seal.');
    }
  },
};
