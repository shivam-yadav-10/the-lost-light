import { FirebaseError } from 'firebase/app';
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
} from 'firebase/firestore';
import type { EarnedFragment, FragmentMeta, FragmentState, PuzzleKind, PuzzleSummary, TeamProgress } from '../api/types';
import { initializeSession } from './authService';
import { GameServicesUnavailableError, requireFirebaseServices } from './firebase';
import { TeamLoginError } from './teamService';
import { isScheduleLocked, puzzleHintLimit, puzzleRequirements, scoreCompletion, scoringStartAt } from './gameRules';

const ROMAN_NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
const PUZZLE_KINDS: PuzzleKind[] = ['core', 'convergence', 'vault'];
const FRAGMENT_SYMBOLS = ['star', 'crescent', 'diamond', 'ring', 'flame', 'spiral'];
const FRAGMENT_DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

interface PuzzleRecord extends PuzzleSummary {
  requires: number[];
  hintPenalties: number[];
}

interface PuzzleProgressRecord {
  status: 'in_progress' | 'solved';
  hintsUsed: number;
  solvedAt: string | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new GameServicesUnavailableError();
  }
  return value as Record<string, unknown>;
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.trim().length === 0) throw new GameServicesUnavailableError();
  return value;
}

function requiredInteger(record: Record<string, unknown>, key: string, minimum = 0): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum) {
    throw new GameServicesUnavailableError();
  }
  return value;
}

function timestampToIso(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  throw new GameServicesUnavailableError();
}

function parseFragment(value: unknown): FragmentMeta | null {
  if (value == null) return null;
  const fragment = asRecord(value);
  const symbol = fragment.symbol;
  const direction = fragment.direction;
  if (
    typeof symbol !== 'string' ||
    !FRAGMENT_SYMBOLS.includes(symbol) ||
    typeof direction !== 'string' ||
    !FRAGMENT_DIRECTIONS.includes(direction)
  ) {
    throw new GameServicesUnavailableError();
  }
  return {
    symbol: symbol as FragmentMeta['symbol'],
    number: requiredInteger(fragment, 'number', 1),
    direction: direction as FragmentMeta['direction'],
    keyword: requiredString(fragment, 'keyword'),
    colour: requiredString(fragment, 'colour'),
  };
}

function parsePuzzle(documentId: string, rawData: unknown): PuzzleRecord {
  const data = asRecord(rawData);
  const id = Number(documentId);
  const kind = data.kind;
  const requires = data.requires;
  if (
    !Number.isInteger(id) ||
    requiredInteger(data, 'id', 1) !== id ||
    typeof kind !== 'string' ||
    !PUZZLE_KINDS.includes(kind as PuzzleKind) ||
    !Array.isArray(requires) ||
    !requires.every((value) => typeof value === 'number' && Number.isInteger(value) && value > 0)
  ) {
    throw new GameServicesUnavailableError();
  }

  const unlockAt = timestampToIso(data.unlockAt);
  const hintPenalties = data.hintPenalties;
  if (
    !Array.isArray(hintPenalties) ||
    !hintPenalties.every((value) => typeof value === 'number' && Number.isInteger(value) && value >= 0)
  ) {
    throw new GameServicesUnavailableError();
  }
  return {
    id,
    slug: requiredString(data, 'slug'),
    title: requiredString(data, 'title'),
    fragmentName: requiredString(data, 'fragmentName'),
    kind: kind as PuzzleKind,
    sortOrder: requiredInteger(data, 'sortOrder', 1),
    state: 'LOCKED',
    unlockAt,
    solvedAt: null,
    hintsUsed: 0,
    maxHints: puzzleHintLimit(requiredInteger(data, 'maxHints')),
    requires: puzzleRequirements(id, requires),
    hintPenalties,
  };
}

function parseProgress(rawData: unknown): PuzzleProgressRecord {
  const data = asRecord(rawData);
  const status = data.status;
  if (status !== 'in_progress' && status !== 'solved') throw new GameServicesUnavailableError();
  return {
    status,
    hintsUsed: requiredInteger(data, 'hintsUsed'),
    solvedAt: timestampToIso(data.solvedAt),
  };
}

function toFragment(value: FragmentMeta, puzzle: PuzzleRecord): EarnedFragment {
  const numeral = ROMAN_NUMERALS[puzzle.sortOrder - 1];
  if (!numeral) throw new GameServicesUnavailableError();
  return {
    ...value,
    puzzleId: puzzle.id,
    numeral,
    title: puzzle.title,
  };
}

function toPuzzleSummaries(
  puzzles: PuzzleRecord[],
  progressByPuzzle: Map<number, PuzzleProgressRecord>,
): PuzzleSummary[] {
  const now = Date.now();
  return puzzles.map((puzzle) => {
    const progress = progressByPuzzle.get(puzzle.id);
    const scheduled = isScheduleLocked(puzzle.unlockAt, now);
    const prerequisitesMet = puzzle.requires.every((id) => progressByPuzzle.get(id)?.status === 'solved');
    const state: FragmentState = progress?.status === 'solved'
      ? 'SOLVED'
      : scheduled || !prerequisitesMet
        ? 'LOCKED'
        : 'AVAILABLE';
    return {
      id: puzzle.id,
      slug: puzzle.slug,
      title: puzzle.title,
      fragmentName: puzzle.fragmentName,
      kind: puzzle.kind,
      sortOrder: puzzle.sortOrder,
      state,
      unlockAt: puzzle.unlockAt,
      solvedAt: progress?.solvedAt ?? null,
      hintsUsed: progress?.hintsUsed ?? 0,
      maxHints: puzzle.maxHints,
    };
  });
}

function toCheckpoints(
  visits: Array<{ id: string; data: () => unknown }>,
): TeamProgress['checkpoints'] {
  return visits
    .map((snapshot) => {
      const visit = asRecord(snapshot.data());
      const visitedAt = timestampToIso(visit.visitedAt);
      if (!visitedAt) throw new GameServicesUnavailableError();
      return {
        code: requiredString(visit, 'code'),
        title: requiredString(visit, 'title'),
        visitedAt,
      };
    })
    .sort((left, right) => left.visitedAt.localeCompare(right.visitedAt));
}

function toTeamProgress(
  team: Record<string, unknown>,
  teamNumber: number,
  puzzleDocuments: Array<{ id: string; data: () => unknown }>,
  progressDocuments: Array<{ id: string; data: () => unknown }>,
  visitDocuments: Array<{ id: string; data: () => unknown }>,
  rewardDocuments: Array<{ id: string; data: () => unknown }>,
  rawConfig: unknown,
): TeamProgress {
  const puzzles = puzzleDocuments.map((snapshot) => parsePuzzle(snapshot.id, snapshot.data()));
  puzzles.sort((left, right) => left.sortOrder - right.sortOrder);
  if (puzzles.length === 0) throw new GameServicesUnavailableError();

  const config = rawConfig == null ? {} : asRecord(rawConfig);
  const scheduleStartAt = scoringStartAt(timestampToIso(config.scheduleStartAt), timestampToIso(config.testScoringStartAt));
  if (config.unlockOverrides != null) {
    const overrides = asRecord(config.unlockOverrides);
    for (const [rawId, value] of Object.entries(overrides)) {
      const id = Number(rawId);
      const puzzle = puzzles.find((candidate) => candidate.id === id);
      const unlockAt = timestampToIso(value);
      if (!puzzle || puzzle.kind !== 'core' || !unlockAt) throw new GameServicesUnavailableError();
      puzzle.unlockAt = unlockAt;
    }
  }

  const progressByPuzzle = new Map(
    progressDocuments.map((snapshot) => [Number(snapshot.id), parseProgress(snapshot.data())]),
  );
  if ([...progressByPuzzle.keys()].some((id) => !puzzles.some((puzzle) => puzzle.id === id))) {
    throw new GameServicesUnavailableError();
  }

  const summaries = toPuzzleSummaries(puzzles, progressByPuzzle);
  const corePuzzles = summaries.filter((puzzle) => puzzle.kind === 'core');
  const coreSolved = corePuzzles.filter((puzzle) => puzzle.state === 'SOLVED').length;
  const convergenceSolved = summaries.some((puzzle) => puzzle.kind === 'convergence' && puzzle.state === 'SOLVED');
  const allCoreSolved = corePuzzles.length > 0 && coreSolved === corePuzzles.length;
  const lightMessages = config.lightMessages == null ? {} : asRecord(config.lightMessages);
  const lightMessage = allCoreSolved && !convergenceSolved ? lightMessages.partial : null;
  if (lightMessage !== null && typeof lightMessage !== 'string') throw new GameServicesUnavailableError();

  const fragments = puzzles
    .filter((puzzle) => puzzle.kind === 'core' && progressByPuzzle.get(puzzle.id)?.status === 'solved')
    .flatMap((puzzle) => {
      const earnedData = rewardDocuments.find((snapshot) => Number(snapshot.id) === puzzle.id);
      if (!earnedData) throw new GameServicesUnavailableError();
      const fragment = parseFragment(asRecord(earnedData.data()).fragment);
      return fragment ? [toFragment(fragment, puzzle)] : [];
    });
  const totalHintsUsed = [...progressByPuzzle.values()].reduce((sum, progress) => sum + progress.hintsUsed, 0);
  const penaltyMinutes = [...progressByPuzzle.entries()].reduce((total, [puzzleId, progress]) => {
    const puzzle = puzzles.find((candidate) => candidate.id === puzzleId);
    if (!puzzle) throw new GameServicesUnavailableError();
    return total + puzzle.hintPenalties.slice(0, progress.hintsUsed).reduce((sum, penalty) => sum + penalty, 0);
  }, 0);
  const vault = puzzles.find((puzzle) => puzzle.kind === 'vault');
  const vaultSolvedAt = vault ? progressByPuzzle.get(vault.id)?.solvedAt ?? null : null;
  const score = scoreCompletion(vaultSolvedAt, penaltyMinutes, scheduleStartAt);
  return {
    teamId: teamNumber,
    teamName: requiredString(team, 'teamName'),
    introSeen: team.introSeenAt != null,
    puzzles: summaries,
    coreSolved,
    coreTotal: corePuzzles.length,
    allCoreSolved,
    gameComplete: summaries.some((puzzle) => puzzle.kind === 'vault' && puzzle.state === 'SOLVED'),
    lightPercent: convergenceSolved ? 100 : Math.round((Math.min(coreSolved, 5) / 6) * 100),
    lightMessage: typeof lightMessage === 'string' ? lightMessage : null,
    fragments,
    checkpoints: toCheckpoints(visitDocuments),
    scheduleStartAt,
    totalHintsUsed,
    penaltyMinutes,
    vaultSolvedAt,
    elapsedMs: score?.elapsedMs ?? null,
    adjustedElapsedMs: score?.adjustedElapsedMs ?? null,
  };
}

export async function getTeamProgress(teamDocId: string, teamNumber: number): Promise<TeamProgress> {
  if (!teamDocId.trim() || !Number.isInteger(teamNumber) || teamNumber < 1) {
    throw new GameServicesUnavailableError();
  }

  const { firestore } = requireFirebaseServices();
  const user = await initializeSession();
  const teamRef = doc(firestore, 'teams', teamDocId);

  try {
    const teamSnapshot = await getDoc(teamRef);
    if (!teamSnapshot.exists()) throw new GameServicesUnavailableError();

    const team = asRecord(teamSnapshot.data());
    const assignedUids = Array.isArray(team.assignedUids) ? team.assignedUids.filter((v) => typeof v === 'string') : [];
    if (!assignedUids.includes(user.uid)) {
      throw new TeamLoginError('This team is no longer linked to this device.');
    }
    if (team.active !== true || team.teamNumber !== teamNumber) {
      throw new GameServicesUnavailableError();
    }

    const [puzzles, progress, visits, config] = await Promise.all([
      getDocs(collection(firestore, 'puzzles')),
      getDocs(collection(teamRef, 'progress')),
      getDocs(collection(teamRef, 'checkpointVisits')),
      getDoc(doc(firestore, 'gameConfig', 'main')),
    ]);
    const solvedPuzzleIds = progress.docs
      .filter((snapshot) => snapshot.get('status') === 'solved')
      .map((snapshot) => Number(snapshot.id));
    const rewards = await Promise.all(
      solvedPuzzleIds.map((id) => getDoc(doc(teamRef, 'puzzleRewards', String(id)))),
    );

    return toTeamProgress(
      team,
      teamNumber,
      puzzles.docs,
      progress.docs,
      visits.docs,
      rewards.filter((snapshot) => snapshot.exists()),
      config.exists() ? config.data() : null,
    );
  } catch (error) {
    if (error instanceof TeamLoginError || error instanceof GameServicesUnavailableError) throw error;
    if (error instanceof FirebaseError) throw new GameServicesUnavailableError();
    throw error;
  }
}
