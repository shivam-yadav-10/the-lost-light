import { signInWithEmailAndPassword, signOut, type Auth, type UserCredential } from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { Timestamp, collection, deleteField, doc, getDoc, getDocs, runTransaction, serverTimestamp } from 'firebase/firestore';
import type { DocumentData, Firestore, QueryDocumentSnapshot, QuerySnapshot } from 'firebase/firestore';
import type { AdminOverview, FragmentState, PuzzleKind } from '../api/types';
import { requireAdminFirebaseServices } from './firebase';
import { isScheduleLocked, puzzleRequirements, rankTeams, scoringStartAt } from './gameRules';

const PUZZLE_KINDS: PuzzleKind[] = ['core', 'convergence', 'vault'];
interface OverviewCache {
  firestore: Firestore;
  puzzles: QuerySnapshot<DocumentData>;
  adminTeams: QuerySnapshot<DocumentData>;
  teams: QuerySnapshot<DocumentData>;
  progress: Map<string, QuerySnapshot<DocumentData>>;
}
let overviewCache: OverviewCache | null = null;
let pendingOverview: Promise<AdminOverview> | null = null;
let cacheVersion = 0;

function clearOverviewCache() {
  overviewCache = null;
  pendingOverview = null;
  cacheVersion++;
}

export class AdminServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdminServiceError';
  }
}

interface AdminPuzzle {
  id: number;
  title: string;
  fragmentName: string;
  kind: PuzzleKind;
  sortOrder: number;
  requires: number[];
  unlockAt: string | null;
  hintPenalties: number[];
}

interface AdminProgress {
  status: 'in_progress' | 'solved';
  hintsUsed: number;
  startedAt: string | null;
  solvedAt: string | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AdminServiceError('Organiser data in Firebase is incomplete.');
  }
  return value as Record<string, unknown>;
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new AdminServiceError('Organiser data in Firebase is incomplete.');
  }
  return value;
}

function requiredInteger(record: Record<string, unknown>, key: string, minimum = 0): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum) {
    throw new AdminServiceError('Organiser data in Firebase is incomplete.');
  }
  return value;
}

function timestampToIso(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  throw new AdminServiceError('Organiser data in Firebase is incomplete.');
}

function firebaseError(error: FirebaseError, action: string): AdminServiceError {
  if (error.code === 'permission-denied') {
    return new AdminServiceError(`Firebase denied organiser access. Check the deployed Firestore rules and admins/{uid} allowlist.`);
  }
  return new AdminServiceError(`Could not ${action} from Firebase. (${error.code})`);
}

function errorMessage(error: unknown, action: string): string {
  if (error instanceof AdminServiceError) return error.message;
  if (error instanceof FirebaseError) return firebaseError(error, action).message;
  if (error instanceof Error) return error.message;
  return `Could not ${action} from Firebase.`;
}

function parsePuzzle(snapshot: QueryDocumentSnapshot<DocumentData>): AdminPuzzle {
  const data = asRecord(snapshot.data());
  const id = Number(snapshot.id);
  const kind = data.kind;
  const requires = data.requires;
  const hintPenalties = data.hintPenalties;
  if (
    !Number.isInteger(id) ||
    requiredInteger(data, 'id', 1) !== id ||
    typeof kind !== 'string' ||
    !PUZZLE_KINDS.includes(kind as PuzzleKind) ||
    !Array.isArray(requires) ||
    !requires.every((value) => typeof value === 'number' && Number.isInteger(value) && value > 0) ||
    !Array.isArray(hintPenalties) ||
    !hintPenalties.every((value) => typeof value === 'number' && Number.isInteger(value) && value >= 0)
  ) {
    throw new AdminServiceError('Organiser data in Firebase is incomplete.');
  }

  return {
    id,
    title: requiredString(data, 'title'),
    fragmentName: requiredString(data, 'fragmentName'),
    kind: kind as PuzzleKind,
    sortOrder: requiredInteger(data, 'sortOrder', 1),
    requires: puzzleRequirements(id, requires),
    unlockAt: timestampToIso(data.unlockAt),
    hintPenalties,
  };
}

function parseProgress(snapshot: QueryDocumentSnapshot<DocumentData>): AdminProgress {
  const data = asRecord(snapshot.data());
  const status = data.status;
  if (status !== 'in_progress' && status !== 'solved') {
    throw new AdminServiceError('Organiser data in Firebase is incomplete.');
  }
  return {
    status,
    hintsUsed: requiredInteger(data, 'hintsUsed'),
    startedAt: timestampToIso(data.startedAt),
    solvedAt: timestampToIso(data.solvedAt),
  };
}

function parseUnlockOverrides(value: unknown, puzzles: AdminPuzzle[]): void {
  if (value == null) return;
  const overrides = asRecord(value);
  for (const [rawId, timestamp] of Object.entries(overrides)) {
    const id = Number(rawId);
    const puzzle = puzzles.find((candidate) => candidate.id === id);
    const unlockAt = timestampToIso(timestamp);
    if (!puzzle || puzzle.kind !== 'core' || !unlockAt) {
      throw new AdminServiceError('Organiser unlock overrides in Firebase are invalid.');
    }
    puzzle.unlockAt = unlockAt;
  }
}

async function assertAdmin(firestore: Firestore, uid: string): Promise<void> {
  const adminSnapshot = await getDoc(doc(firestore, 'admins', uid));
  if (!adminSnapshot.exists()) {
    throw new AdminServiceError('This Firebase account is not on the organiser allowlist.');
  }
}

async function ensureSignedOut(auth: Auth): Promise<void> {
  clearOverviewCache();
  try {
    await signOut(auth);
  } catch (error) {
    if (error instanceof FirebaseError) {
      throw firebaseError(error, 'sign out');
    }
    throw error;
  }
}

async function verifyCredential(
  auth: Auth,
  firestore: Firestore,
  credential: UserCredential,
): Promise<string> {
  try {
    await assertAdmin(firestore, credential.user.uid);
    return credential.user.uid;
  } catch (error) {
    await ensureSignedOut(auth);
    throw error;
  }
}

function authFailureMessage(error: FirebaseError): string {
  if (
    error.code === 'auth/invalid-credential' ||
    error.code === 'auth/invalid-login-credentials' ||
    error.code === 'auth/user-not-found' ||
    error.code === 'auth/wrong-password'
  ) {
    return 'Email or password is incorrect.';
  }
  if (error.code === 'auth/operation-not-allowed') {
    return 'Enable Email/Password sign-in in Firebase Authentication first.';
  }
  return firebaseError(error, 'authenticate the organiser').message;
}

export async function getCurrentAdminUid(): Promise<string | null> {
  const { auth, firestore } = requireAdminFirebaseServices();
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) return null;
  try {
    await assertAdmin(firestore, user.uid);
    return user.uid;
  } catch (error) {
    await ensureSignedOut(auth);
    throw error;
  }
}

export async function signInAdmin(email: string, password: string): Promise<string> {
  clearOverviewCache();
  const { auth, firestore } = requireAdminFirebaseServices();
  if (!email.trim() || !password) {
    throw new AdminServiceError('Enter your organiser email and password.');
  }

  try {
    const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
    return await verifyCredential(auth, firestore, credential);
  } catch (error) {
    if (error instanceof FirebaseError) throw new AdminServiceError(authFailureMessage(error).toString());
    throw error;
  }
}

export async function signOutAdmin(): Promise<void> {
  const { auth } = requireAdminFirebaseServices();
  await ensureSignedOut(auth);
}

export function getAdminOverview(): Promise<AdminOverview> {
  if (pendingOverview) return pendingOverview;
  const request = loadAdminOverview();
  pendingOverview = request;
  const clearPending = () => {
    if (pendingOverview === request) pendingOverview = null;
  };
  void request.then(clearPending, clearPending);
  return request;
}

async function loadAdminOverview(reuseProgress = false): Promise<AdminOverview> {
  const { firestore } = requireAdminFirebaseServices();
  const version = cacheVersion;
  const cached = overviewCache?.firestore === firestore ? overviewCache : null;
  try {
    const [teamsSnapshot, puzzlesSnapshot, configSnapshot, adminTeamsSnapshot] = await Promise.all([
      reuseProgress && cached ? cached.teams : getDocs(collection(firestore, 'teams')),
      cached ? cached.puzzles : getDocs(collection(firestore, 'puzzles')),
      getDoc(doc(firestore, 'gameConfig', 'main')),
      cached ? cached.adminTeams : getDocs(collection(firestore, 'adminTeamData')),
    ]);

    if (!configSnapshot.exists()) {
      throw new AdminServiceError('Organiser data is not provisioned. Run the Firebase seed command with --apply.');
    }

    const puzzles = puzzlesSnapshot.docs.map(parsePuzzle).sort((left, right) => left.sortOrder - right.sortOrder);
    if (puzzles.length === 0) throw new AdminServiceError('No puzzle documents were found in Firebase.');
    const gameConfig = asRecord(configSnapshot.data());
    parseUnlockOverrides(gameConfig.unlockOverrides, puzzles);
    const testStart = timestampToIso(gameConfig.testScoringStartAt);
    const scheduleStartAt = scoringStartAt(timestampToIso(gameConfig.scheduleStartAt), testStart);

    const adminTeamData = new Map(adminTeamsSnapshot.docs.map((snapshot) => [snapshot.id, asRecord(snapshot.data())]));
    const progressSnapshots = new Map<string, QuerySnapshot<DocumentData>>();
    const teamRows = await Promise.all(teamsSnapshot.docs.map(async (teamSnapshot) => {
      const team = asRecord(teamSnapshot.data());
      const teamNumber = requiredInteger(team, 'teamNumber', 1);
      const teamName = requiredString(team, 'teamName');
      const privateData = adminTeamData.get(teamSnapshot.id);
      if (!privateData || requiredInteger(privateData, 'teamNumber', 1) !== teamNumber) {
        throw new AdminServiceError(`Organiser metadata is missing for team ${teamName}. Run the Firebase seed command with --apply.`);
      }

      const teamRef = doc(firestore, 'teams', teamSnapshot.id);
      const savedProgress = reuseProgress ? cached?.progress.get(teamSnapshot.id) : undefined;
      const progressSnapshot = savedProgress ?? await getDocs(collection(teamRef, 'progress'));
      progressSnapshots.set(teamSnapshot.id, progressSnapshot);
      const progressByPuzzle = new Map(progressSnapshot.docs.map((snapshot) => [Number(snapshot.id), parseProgress(snapshot)]));

      const teamPuzzles = puzzles.map((puzzle) => {
        const progress = progressByPuzzle.get(puzzle.id);
        const scheduled = isScheduleLocked(puzzle.unlockAt);
        const prerequisitesMet = puzzle.requires.every((id) => progressByPuzzle.get(id)?.status === 'solved');
        const state: FragmentState = progress?.status === 'solved'
          ? 'SOLVED'
          : scheduled || !prerequisitesMet
            ? 'LOCKED'
            : 'AVAILABLE';
        return {
          puzzleId: puzzle.id,
          state,
          hintsUsed: progress?.hintsUsed ?? 0,
          startedAt: progress?.startedAt ?? null,
          solvedAt: progress?.solvedAt ?? null,
        };
      });

      const penaltyMinutes = [...progressByPuzzle.entries()].reduce((total, [puzzleId, progress]) => {
        const puzzle = puzzles.find((candidate) => candidate.id === puzzleId);
        if (!puzzle) throw new AdminServiceError('Progress references a puzzle that does not exist.');
        return total + puzzle.hintPenalties.slice(0, progress.hintsUsed).reduce((sum, minutes) => sum + minutes, 0);
      }, 0);
      const vault = puzzles.find((puzzle) => puzzle.kind === 'vault');
      const vaultSolvedAt = vault ? progressByPuzzle.get(vault.id)?.solvedAt ?? null : null;
      const totalHintsUsed = [...progressByPuzzle.values()].reduce((total, progress) => total + progress.hintsUsed, 0);
      return {
        id: teamNumber,
        name: teamName,
        lastSeenAt: timestampToIso(team.lastSeenAt),
        errandGroup: requiredString(privateData, 'errandGroup'),
        errandLocation: requiredString(privateData, 'errandLocation'),
        riddleSet: requiredString(privateData, 'riddleSet'),
        lanternKey: requiredString(privateData, 'lanternKey'),
        totalHintsUsed,
        penaltyMinutes,
        vaultSolvedAt,
        puzzles: teamPuzzles,
      };
    }));
    const scores = rankTeams(teamRows.map((team) => ({
      id: team.id,
      completedAt: team.vaultSolvedAt,
      penaltyMinutes: team.penaltyMinutes,
      totalHintsUsed: team.totalHintsUsed,
    })), scheduleStartAt);
    const scoresByTeam = new Map(scores.map((score) => [score.team.id, score]));
    const rankedTeams = teamRows.map((team) => {
      const score = scoresByTeam.get(team.id)!;
      return { ...team, rank: score.rank, elapsedMs: score.elapsedMs, adjustedElapsedMs: score.adjustedElapsedMs };
    }).sort((left, right) => left.rank - right.rank);

    if (version === cacheVersion) overviewCache = {
      firestore, puzzles: puzzlesSnapshot, adminTeams: adminTeamsSnapshot,
      teams: teamsSnapshot, progress: progressSnapshots,
    };
    return {
      generatedAt: new Date().toISOString(),
      scheduleStartAt,
      testScoringActive: testStart !== null,
      puzzles: puzzles.map((puzzle) => ({
        id: puzzle.id,
        title: puzzle.title,
        fragmentName: puzzle.fragmentName,
        kind: puzzle.kind,
        unlockAt: puzzle.unlockAt,
        scheduleLocked: isScheduleLocked(puzzle.unlockAt),
      })),
      teams: rankedTeams,
    };
  } catch (error) {
    if (error instanceof AdminServiceError) throw error;
    if (error instanceof FirebaseError) throw firebaseError(error, 'load organiser data');
    throw error;
  }
}

export async function setPuzzleUnlockOverride(puzzleId: number, unlocked: boolean): Promise<AdminOverview> {
  if (!Number.isInteger(puzzleId) || puzzleId < 1) {
    throw new AdminServiceError('Invalid puzzle id.');
  }
  const { firestore } = requireAdminFirebaseServices();
  const puzzleRef = doc(firestore, 'puzzles', String(puzzleId));
  const configRef = doc(firestore, 'gameConfig', 'main');
  const lockedUntil = new Date(Date.now() + 100 * 365 * 24 * 60 * 60_000);

  try {
    await runTransaction(firestore, async (transaction) => {
      const [puzzleSnapshot, configSnapshot] = await Promise.all([
        transaction.get(puzzleRef),
        transaction.get(configRef),
      ]);
      if (!puzzleSnapshot.exists() || !configSnapshot.exists()) {
        throw new AdminServiceError('Puzzle schedule data is missing in Firebase.');
      }
      if (puzzleSnapshot.get('kind') !== 'core') {
        throw new AdminServiceError('Only core fragments can have their release overridden.');
      }
      const config = asRecord(configSnapshot.data());
      const currentOverrides = config.unlockOverrides == null ? {} : asRecord(config.unlockOverrides);
      transaction.update(configRef, {
        unlockOverrides: {
          ...currentOverrides,
          [String(puzzleId)]: unlocked ? serverTimestamp() : Timestamp.fromDate(lockedUntil),
        },
        ...(puzzleId === 1 ? { testScoringStartAt: unlocked ? serverTimestamp() : deleteField() } : {}),
      });
    });
    if (pendingOverview) await pendingOverview;
    return await loadAdminOverview(true);
  } catch (error) {
    if (error instanceof AdminServiceError) throw error;
    if (error instanceof FirebaseError) throw firebaseError(error, 'update the release schedule');
    throw error;
  }
}

export function getAdminErrorMessage(error: unknown): string {
  return errorMessage(error, 'load organiser data');
}
