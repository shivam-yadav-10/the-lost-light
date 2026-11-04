import { config } from '../config.js';
import { getDb, queryAll, queryOne, transaction } from '../db/connection.js';
import { LIGHT_MESSAGES } from '../content/public.js';
import {
  ERRAND_LOCATIONS,
  PROTECTED_PUZZLES,
  errandGroup,
  protectedPuzzle,
  riddleSet,
  variantKey,
} from '../content/protected.js';
import type { ContentBlock, FragmentMeta, ProtectedPuzzle, ShardType } from '../content/types.js';
import {
  HttpError,
  type CheckpointRow,
  type FragmentState,
  type ProgressRow,
  type PuzzleDetail,
  type PuzzleRow,
  type PuzzleSummary,
  type TeamRow,
} from '../types.js';
import {
  keeperSeal,
  shardContent,
  teamKey,
  verifiedShards,
  overlayState,
  validateOverlaySubmission,
} from './convergence.js';
import { normaliseAnswer } from './normalise.js';
import { checkHiddenWords } from './hiddenWords.js';
import { EVENT_START_AT, rankTeams, scoreCompletion } from './scoring.js';

const MAX_ANSWER_LENGTH = 200;
const MAX_CHECKPOINT_CODE_LENGTH = 64;
const MAX_TEAM_HINTS = 12;
const MAX_PUZZLE_HINTS = 3;
const NOW_SQL = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

// ---------- teams ----------

export function findTeamByKey(gameKey: string): TeamRow | undefined {
  return queryOne<TeamRow>('SELECT * FROM teams WHERE game_key = ?', gameKey);
}

export function touchTeam(teamId: number): void {
  getDb().prepare(`UPDATE teams SET last_seen_at = ${NOW_SQL} WHERE id = ?`).run(teamId);
}

/** Records that the team has watched (or skipped) the opening story; the first time wins. */
export function markIntroSeen(teamId: number): void {
  getDb()
    .prepare(`UPDATE teams SET intro_seen_at = COALESCE(intro_seen_at, ${NOW_SQL}) WHERE id = ?`)
    .run(teamId);
}

// ---------- puzzles & state ----------

function listPuzzles(): PuzzleRow[] {
  return queryAll<PuzzleRow>('SELECT * FROM puzzles ORDER BY sort_order');
}

function getPuzzle(puzzleId: number): PuzzleRow {
  const row = queryOne<PuzzleRow>('SELECT * FROM puzzles WHERE id = ?', puzzleId);
  if (!row) throw new HttpError(404, 'Puzzle not found');
  return row;
}

function requirementsOf(puzzle: PuzzleRow): number[] {
  const parsed: unknown = JSON.parse(puzzle.requires_json || '[]');
  const ids = Array.isArray(parsed) ? parsed.filter((n): n is number => typeof n === 'number') : [];
  if (puzzle.requires_puzzle_id) ids.push(puzzle.requires_puzzle_id);
  if (puzzle.id > 1) ids.push(puzzle.id - 1);
  return ids;
}

function progressMap(teamId: number): Map<number, ProgressRow> {
  const rows = queryAll<ProgressRow>('SELECT * FROM team_progress WHERE team_id = ?', teamId);
  return new Map(rows.map((r) => [r.puzzle_id, r]));
}

function ensureProgressRow(teamId: number, puzzleId: number): void {
  getDb().prepare('INSERT OR IGNORE INTO team_progress (team_id, puzzle_id) VALUES (?, ?)').run(teamId, puzzleId);
}

function resolveState(puzzle: PuzzleRow, progress: Map<number, ProgressRow>): FragmentState {
  if (progress.get(puzzle.id)?.status === 'solved') return 'SOLVED';
  if (puzzle.unlock_at && new Date(puzzle.unlock_at) > config.now()) return 'LOCKED';
  if (requirementsOf(puzzle).some((id) => progress.get(id)?.status !== 'solved')) return 'LOCKED';
  return 'AVAILABLE';
}

function toSummary(puzzle: PuzzleRow, progress: Map<number, ProgressRow>): PuzzleSummary {
  const p = progress.get(puzzle.id);
  return {
    id: puzzle.id,
    slug: puzzle.slug,
    title: puzzle.title,
    fragmentName: puzzle.fragment_name,
    kind: puzzle.kind,
    sortOrder: puzzle.sort_order,
    state: resolveState(puzzle, progress),
    unlockAt: puzzle.unlock_at,
    solvedAt: p?.solved_at ?? null,
    hintsUsed: p?.hints_used ?? 0,
    maxHints: Math.min(MAX_PUZZLE_HINTS, puzzle.max_hints),
  };
}

function assertPlayable(puzzle: PuzzleRow, progress: Map<number, ProgressRow>): void {
  const state = resolveState(puzzle, progress);
  if (state === 'LOCKED') throw new HttpError(423, 'This fragment is still hidden.');
  if (state === 'SOLVED') throw new HttpError(409, 'Already solved.');
}

function revealedHints(puzzleId: number, count: number): string[] {
  if (count <= 0) return [];
  return queryAll<{ text: string }>(
    'SELECT text FROM hints WHERE puzzle_id = ? AND hint_order <= ? ORDER BY hint_order',
    puzzleId,
    count,
  ).map((h) => h.text);
}

/** Message shown once solved. The Convergence message embeds the team's own key. */
function completionMessage(secret: ProtectedPuzzle, teamId: number): string {
  return secret.completionMessage.replace('{key}', secret.id === 7 ? teamKey(teamId) : '');
}

export interface EarnedFragment extends FragmentMeta {
  puzzleId: number;
  numeral: string;
  title: string;
}

/** Fragment cards a team has earned. Only the DISPLAYED values; true values are never sent. */
function earnedFragments(progress: Map<number, ProgressRow>, puzzles: PuzzleRow[]): EarnedFragment[] {
  return puzzles
    .filter((p) => p.kind === 'core' && progress.get(p.id)?.status === 'solved')
    .flatMap((p) => {
      const fragment = protectedPuzzle(p.id).fragment;
      return fragment ? [{ ...fragment, puzzleId: p.id, numeral: ROMAN[p.sort_order - 1], title: p.title }] : [];
    });
}

// ---------- team-facing operations ----------

export function getTeamProgress(teamId: number) {
  const progress = progressMap(teamId);
  const rows = listPuzzles();
  const puzzles = rows.map((p) => toSummary(p, progress));
  const core = puzzles.filter((p) => p.kind === 'core');
  const coreSolved = core.filter((p) => p.state === 'SOLVED').length;
  const convergenceSolved = puzzles.some((p) => p.kind === 'convergence' && p.state === 'SOLVED');
  const allCoreSolved = core.length > 0 && coreSolved === core.length;
  const vault = rows.find((puzzle) => puzzle.kind === 'vault');
  const vaultSolvedAt = vault ? progress.get(vault.id)?.solved_at ?? null : null;
  const penaltyMinutes = [...progress.values()].reduce(
    (sum, row) => sum + hintPenaltyMinutes(row.puzzle_id, row.hints_used),
    0,
  );
  const score = scoreCompletion(vaultSolvedAt, penaltyMinutes);
  const checkpoints = queryAll<{ code: string; title: string; visitedAt: string }>(
    `SELECT c.code, c.title, v.visited_at AS visitedAt
     FROM checkpoint_visits v JOIN checkpoints c ON c.id = v.checkpoint_id
     WHERE v.team_id = ? ORDER BY v.visited_at`,
    teamId,
  );
  // One sixth of the light per fragment, but the false flame adds nothing: 6/6 still reads 83%.
  const lightPercent = convergenceSolved ? 100 : Math.round((Math.min(coreSolved, 5) / 6) * 100);
  return {
    puzzles,
    coreSolved,
    coreTotal: core.length,
    allCoreSolved,
    gameComplete: puzzles.some((p) => p.kind === 'vault' && p.state === 'SOLVED'),
    lightPercent,
    lightMessage: allCoreSolved && !convergenceSolved ? LIGHT_MESSAGES.partial : null,
    fragments: earnedFragments(progress, rows),
    checkpoints,
    scheduleStartAt: EVENT_START_AT,
    totalHintsUsed: [...progress.values()].reduce((sum, row) => sum + row.hints_used, 0),
    penaltyMinutes,
    vaultSolvedAt,
    elapsedMs: score?.elapsedMs ?? null,
    adjustedElapsedMs: score?.adjustedElapsedMs ?? null,
  };
}

export function getPuzzleForTeam(teamId: number, puzzleId: number): PuzzleDetail {
  const puzzle = getPuzzle(puzzleId);
  const progress = progressMap(teamId);
  const summary = toSummary(puzzle, progress);
  if (summary.state === 'LOCKED') throw new HttpError(423, 'This fragment is still hidden.');
  if (!progress.has(puzzleId)) ensureProgressRow(teamId, puzzleId);

  const secret = protectedPuzzle(puzzleId);
  const solved = summary.state === 'SOLVED';
  return {
    ...summary,
    intro: puzzle.intro,
    blocks: blocksForTeam(puzzle, teamId),
    revealedHints: revealedHints(puzzleId, summary.hintsUsed),
    fragment: solved && secret.fragment ? secret.fragment : null,
    completionMessage: solved ? completionMessage(secret, teamId) : null,
  };
}

/** Shared blocks plus any blocks for this team's variant group (e.g. its own errand riddle or riddle set). */
function blocksForTeam(puzzle: PuzzleRow, teamId: number): ContentBlock[] {
  const body: unknown = JSON.parse(puzzle.body);
  if (Array.isArray(body)) return body as ContentBlock[];
  const { blocks, variants } = body as { blocks: ContentBlock[]; variants?: Record<string, ContentBlock[]> };
  if (!variants) return blocks;
  return [...blocks, ...(variants[variantKey(teamId, Object.keys(variants))] ?? [])];
}

function enforceRateLimit(teamId: number, puzzleId: number, secret: ProtectedPuzzle): void {
  const { cooldownMs, maxWrong, windowMs, lockoutMs } = secret.rateLimit;
  const now = Date.now();
  const last = queryOne<{ submitted_at: string }>(
    'SELECT submitted_at FROM submissions WHERE team_id = ? AND puzzle_id = ? ORDER BY id DESC LIMIT 1',
    teamId,
    puzzleId,
  );
  if (last) {
    const waitMs = cooldownMs - (now - new Date(last.submitted_at).getTime());
    if (waitMs > 0) {
      throw new HttpError(429, `The flame flickers. Wait ${Math.ceil(waitMs / 1000)}s before trying again.`);
    }
  }
  const wrong = queryAll<{ submitted_at: string }>(
    `SELECT submitted_at FROM submissions
     WHERE team_id = ? AND puzzle_id = ? AND is_correct = 0 AND submitted_at > ? ORDER BY id DESC`,
    teamId,
    puzzleId,
    new Date(now - windowMs).toISOString(),
  );
  if (wrong.length >= maxWrong) {
    const waitMs = new Date(wrong[0].submitted_at).getTime() + lockoutMs - now;
    if (waitMs > 0) {
      throw new HttpError(429, `Too many guesses. The flame rests for ${Math.ceil(waitMs / 60_000)} min.`);
    }
  }
}

const digitsOnly = (raw: string) => raw.replace(/\D/g, '');

interface Verdict {
  correct: boolean;
  message: string;
  stored: string;
}

/** Checks an answer against protected content. Never reveals partial correctness. */
function judge(teamId: number, secret: ProtectedPuzzle, rawAnswer: string, rawProof: string | undefined): Verdict {
  const answer = normaliseAnswer(rawAnswer);
  if (secret.id === 4) {
    const group = variantKey(teamId, Object.keys(secret.hiddenWordsByGroup ?? {}));
    return {
      correct: checkHiddenWords(rawAnswer, secret.hiddenWordsByGroup?.[group]),
      message: secret.incorrectMessage,
      stored: answer,
    };
  }
  const nearMiss = secret.nearMisses.find(
    (n) =>
      n.answers?.some((a) => normaliseAnswer(a) === answer) ||
      n.containsAny?.some((word) => answer.includes(normaliseAnswer(word))),
  );

  if (secret.answersByGroup) {
    // Codes compare on letters and digits only, so "glow 7k4m" and "GLOW-7K4M" both work.
    const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const given = compact(rawAnswer);
    if (secret.id === 5) {
      let answers: unknown;
      try {
        answers = JSON.parse(rawProof ?? 'null');
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        throw new HttpError(400, 'Solve all five day riddles before offering the final word.');
      }
      const expected = secret.riddleAnswersByGroup?.[riddleSet(teamId)];
      if (!expected || !Array.isArray(answers) || answers.length !== 5
        || !expected.every((value, index) => typeof answers[index] === 'string' && compact(answers[index]) === compact(value))) {
        throw new HttpError(400, 'Solve all five day riddles before offering the final word.');
      }
    }
    const own = secret.answersByGroup[variantKey(teamId, Object.keys(secret.answersByGroup))].map(compact);
    if (given.length > 0 && own.includes(given)) return { correct: true, message: '', stored: answer };
    const otherGroup = Object.values(secret.answersByGroup).flat().map(compact).includes(given);
    return {
      correct: false,
      message: otherGroup
        ? (secret.otherGroupMessage ?? "That answer belongs to another team. Yours is waiting somewhere else.")
        : (nearMiss?.message ?? secret.incorrectMessage),
      stored: answer,
    };
  }

  if (secret.id === 7) {
    validateOverlaySubmission(teamId, rawProof);
    const correct = secret.answers.some((candidate) => answer === normaliseAnswer(candidate));
    return {
      correct,
      message: secret.incorrectMessage,
      stored: answer,
    };
  }

  if (secret.id === 8) {
    const proof = digitsOnly(rawProof ?? '');
    const correct = answer === normaliseAnswer(secret.answers[0]) && proof === teamKey(teamId);
    return { correct, message: nearMiss?.message ?? secret.incorrectMessage, stored: `${answer} | ${proof}` };
  }

  const correct = answer.length > 0 && secret.answers.some((a) => normaliseAnswer(a) === answer);
  return { correct, message: nearMiss?.message ?? secret.incorrectMessage, stored: answer };
}

export function submitAnswer(teamId: number, puzzleId: number, rawAnswer: string, rawProof?: string) {
  if (typeof rawAnswer !== 'string' || rawAnswer.length === 0 || rawAnswer.length > MAX_ANSWER_LENGTH) {
    throw new HttpError(400, 'Answer must be between 1 and 200 characters.');
  }
  const db = getDb();
  const puzzle = getPuzzle(puzzleId);
  assertPlayable(puzzle, progressMap(teamId));
  const secret = protectedPuzzle(puzzleId);
  if (puzzle.kind === 'vault' && (typeof rawProof !== 'string' || rawProof.trim().length === 0)) {
    throw new HttpError(400, 'The Vault asks for a word and a proof code.');
  }
  enforceRateLimit(teamId, puzzleId, secret);

  const verdict = judge(teamId, secret, rawAnswer, rawProof);
  transaction(db, () => {
    ensureProgressRow(teamId, puzzleId);
    db.prepare('INSERT INTO submissions (team_id, puzzle_id, answer, is_correct) VALUES (?, ?, ?, ?)').run(
      teamId,
      puzzleId,
      verdict.stored,
      verdict.correct ? 1 : 0,
    );
    if (verdict.correct) {
      db.prepare(
        `UPDATE team_progress SET status = 'solved', solved_at = ${NOW_SQL} WHERE team_id = ? AND puzzle_id = ?`,
      ).run(teamId, puzzleId);
    }
  });

  return {
    correct: verdict.correct,
    message: verdict.correct ? completionMessage(secret, teamId) : verdict.message,
    fragment: verdict.correct ? (secret.fragment ?? null) : null,
    puzzle: toSummary(puzzle, progressMap(teamId)),
  };
}

export function requestHint(teamId: number, puzzleId: number) {
  const db = getDb();
  const puzzle = getPuzzle(puzzleId);
  const maxHints = Math.min(MAX_PUZZLE_HINTS, puzzle.max_hints);
  return transaction(db, () => {
    const progress = progressMap(teamId);
    assertPlayable(puzzle, progress);
    const used = progress.get(puzzleId)?.hints_used ?? 0;
    const totalUsed = [...progress.values()].reduce((sum, row) => sum + row.hints_used, 0);
    if (used >= maxHints) throw new HttpError(409, 'No more hints remain for this fragment.');
    if (totalUsed >= MAX_TEAM_HINTS) throw new HttpError(409, 'Your team has used all 12 hints for this game.');
    ensureProgressRow(teamId, puzzleId);
    db.prepare('UPDATE team_progress SET hints_used = hints_used + 1 WHERE team_id = ? AND puzzle_id = ?').run(
      teamId,
      puzzleId,
    );
    return { hintsUsed: used + 1, teamHintsUsed: totalUsed + 1, maxHints, hints: revealedHints(puzzleId, used + 1) };
  });
}

export function visitCheckpoint(teamId: number, rawCode: string) {
  if (typeof rawCode !== 'string' || rawCode.length === 0 || rawCode.length > MAX_CHECKPOINT_CODE_LENGTH) {
    throw new HttpError(400, 'Invalid checkpoint code.');
  }
  const checkpoint = queryOne<CheckpointRow>('SELECT * FROM checkpoints WHERE code = ?', normaliseAnswer(rawCode));
  if (!checkpoint) throw new HttpError(404, 'No marker answers to that code.');

  const existing = queryOne<{ visited_at: string }>(
    'SELECT visited_at FROM checkpoint_visits WHERE team_id = ? AND checkpoint_id = ?',
    teamId,
    checkpoint.id,
  );
  if (!existing) {
    getDb().prepare('INSERT INTO checkpoint_visits (team_id, checkpoint_id) VALUES (?, ?)').run(teamId, checkpoint.id);
  }
  return {
    title: checkpoint.title,
    message: checkpoint.message,
    puzzleId: checkpoint.puzzle_id,
    alreadyVisited: Boolean(existing),
  };
}

// ---------- the convergence ----------

const CONVERGENCE_ID = 7;

/** The team's own seal and unlocked partner cards. */
export function getConvergence(teamId: number) {
  const puzzle = getPuzzle(CONVERGENCE_ID);
  const state = resolveState(puzzle, progressMap(teamId));
  if (state === 'LOCKED') throw new HttpError(423, 'This fragment is still hidden.');
  return overlayState(teamId);
}

export function assertConvergenceOpen(teamId: number): void {
  const state = resolveState(getPuzzle(CONVERGENCE_ID), progressMap(teamId));
  if (state === 'LOCKED') throw new HttpError(423, 'This fragment is still hidden.');
}

// ---------- admin ----------

function hintPenaltyMinutes(puzzleId: number, hintsUsed: number): number {
  const secret = PROTECTED_PUZZLES.find((p) => p.id === puzzleId);
  return (secret?.hints ?? []).slice(0, hintsUsed).reduce((sum, h) => sum + h.penaltyMinutes, 0);
}

/**
 * Admin-only override of a core fragment's scheduled release time: forces it open right now,
 * or re-locks it (far in the future) if it was opened too early. Only the six core puzzles have
 * a release schedule — Convergence and the Vault are gated by prerequisites, not a clock.
 */
export function setPuzzleUnlockOverride(puzzleId: number, unlocked: boolean): void {
  const puzzle = getPuzzle(puzzleId);
  if (puzzle.kind !== 'core') throw new HttpError(400, 'Only the six core fragments have a release schedule to override.');
  const now = config.now().getTime();
  const value = unlocked
    ? new Date(now - 60_000).toISOString() // a minute ago, so it reads as open immediately
    : new Date(now + 100 * 365 * 24 * 60 * 60_000).toISOString(); // ~100 years out: effectively "never" until toggled again
  getDb().prepare('UPDATE puzzles SET unlock_at = ? WHERE id = ?').run(value, puzzleId);
}

/**
 * Admin overview: progress, hints, penalties and Convergence state per team.
 * Never includes game keys or player answers. Lantern keys and Keeper seals are organiser-only.
 */
export function adminOverview() {
  const teams = queryAll<Omit<TeamRow, 'game_key'>>(
    'SELECT id, name, created_at, last_seen_at FROM teams ORDER BY name',
  );
  const puzzles = listPuzzles();
  const allProgress = queryAll<ProgressRow>('SELECT * FROM team_progress');
  const attempts = queryAll<{ team_id: number; puzzle_id: number; n: number }>(
    'SELECT team_id, puzzle_id, COUNT(*) AS n FROM submissions GROUP BY team_id, puzzle_id',
  );
  const attemptMap = new Map(attempts.map((a) => [`${a.team_id}:${a.puzzle_id}`, a.n]));
  const shards = new Map(
    queryAll<{ team_id: number; shard_type: ShardType }>('SELECT team_id, shard_type FROM convergence_shards').map(
      (s) => [s.team_id, s.shard_type],
    ),
  );
  const verified = queryAll<{ team_id: number; shard_type: ShardType }>(
    'SELECT team_id, shard_type FROM convergence_verified ORDER BY shard_type',
  );
  const vault = puzzles.find((p) => p.kind === 'vault');
  const teamRows = teams.map((t) => {
    const progress = new Map(allProgress.filter((r) => r.team_id === t.id).map((r) => [r.puzzle_id, r]));
    const penaltyMinutes = [...progress.values()].reduce(
      (sum, r) => sum + hintPenaltyMinutes(r.puzzle_id, r.hints_used),
      0,
    );
    const vaultSolvedAt = vault ? progress.get(vault.id)?.solved_at ?? null : null;
    const totalHintsUsed = [...progress.values()].reduce((sum, row) => sum + row.hints_used, 0);
    return {
      id: t.id,
      name: t.name,
      lastSeenAt: t.last_seen_at,
      shardType: shards.get(t.id) ?? null,
      errandGroup: errandGroup(t.id),
      errandLocation: ERRAND_LOCATIONS[errandGroup(t.id)],
      riddleSet: riddleSet(t.id),
      verifiedShards: verified.filter((v) => v.team_id === t.id).map((v) => v.shard_type),
      lanternKey: teamKey(t.id),
      penaltyMinutes,
      totalHintsUsed,
      vaultSolvedAt,
      puzzles: puzzles.map((p) => {
        const row = progress.get(p.id);
        return {
          puzzleId: p.id,
          state: resolveState(p, progress),
          hintsUsed: row?.hints_used ?? 0,
          attempts: attemptMap.get(`${t.id}:${p.id}`) ?? 0,
          startedAt: row?.started_at ?? null,
          solvedAt: row?.solved_at ?? null,
        };
      }),
    };
  });
  const ranked = rankTeams(teamRows.map((team) => ({
    id: team.id,
    completedAt: team.vaultSolvedAt,
    penaltyMinutes: team.penaltyMinutes,
    totalHintsUsed: team.totalHintsUsed,
  })));
  const ranks = new Map(ranked.map((entry) => [entry.team.id, entry]));

  return {
    generatedAt: new Date().toISOString(),
    puzzles: puzzles.map((p) => ({
      id: p.id,
      title: p.title,
      fragmentName: p.fragment_name,
      kind: p.kind,
      unlockAt: p.unlock_at,
      scheduleLocked: p.unlock_at ? new Date(p.unlock_at) > config.now() : false,
    })),
    keeperSeals: (['A', 'B', 'C', 'D'] as ShardType[]).map((type) => ({
      type,
      name: shardContent(type).name,
      seal: keeperSeal(type),
      holders: [...shards.values()].filter((t) => t === type).length,
    })),
    scheduleStartAt: EVENT_START_AT,
    teams: teamRows.map((team) => {
      const score = ranks.get(team.id)!;
      return {
        ...team,
        rank: score.rank,
        elapsedMs: score.elapsedMs,
        adjustedElapsedMs: score.adjustedElapsedMs,
      };
    }).sort((left, right) => left.rank - right.rank),
  };
}
