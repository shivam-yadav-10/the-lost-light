export const MAX_TEAM_HINTS = 12;
export const MAX_PUZZLE_HINTS = 3;
export const PUZZLE_IDS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
export const EVENT_START_AT = '2026-11-10T07:30:00.000Z';
export const CORE_QUESTION_SCHEDULE = [
  { id: 1, unlockAt: '2026-11-10T07:30:00.000Z' },
  { id: 2, unlockAt: '2026-11-10T08:00:00.000Z' },
  { id: 3, unlockAt: '2026-11-10T08:30:00.000Z' },
  { id: 4, unlockAt: '2026-11-10T09:00:00.000Z' },
  { id: 5, unlockAt: '2026-11-10T09:30:00.000Z' },
  { id: 6, unlockAt: '2026-11-10T10:00:00.000Z' },
] as const;

/** A release becomes available at its exact timestamp; prerequisites are checked separately. */
export function isScheduleLocked(unlockAt: string | null, nowMs = Date.now()): boolean {
  return unlockAt !== null && Date.parse(unlockAt) > nowMs;
}

export interface ScoringInput {
  id: number;
  completedAt: string | null;
  penaltyMinutes: number;
  totalHintsUsed: number;
}

export interface RankedScore<T extends ScoringInput> {
  team: T;
  rank: number;
  elapsedMs: number | null;
  adjustedElapsedMs: number | null;
}

/** Scores from the fixed event start, never from login or a team's first activity. */
export function scoreCompletion(
  completedAt: string | null,
  penaltyMinutes: number,
  startAt = EVENT_START_AT,
): { elapsedMs: number; adjustedElapsedMs: number } | null {
  if (completedAt === null) return null;
  const finish = Date.parse(completedAt);
  const start = Date.parse(startAt);
  if (
    !Number.isFinite(finish) ||
    !Number.isFinite(start) ||
    !Number.isInteger(penaltyMinutes) ||
    penaltyMinutes < 0
  ) {
    throw new Error('Scoring timestamps or penalties are invalid.');
  }
  const elapsedMs = Math.max(0, finish - start);
  return { elapsedMs, adjustedElapsedMs: elapsedMs + penaltyMinutes * 60_000 };
}

/** Finished teams always rank first; ties use fewer hints, then stable numeric team ID. */
export function rankTeams<T extends ScoringInput>(teams: T[], startAt = EVENT_START_AT): RankedScore<T>[] {
  return teams
    .map((team) => ({ team, score: scoreCompletion(team.completedAt, team.penaltyMinutes, startAt) }))
    .sort((left, right) => {
      if (left.score && !right.score) return -1;
      if (!left.score && right.score) return 1;
      if (left.score && right.score && left.score.adjustedElapsedMs !== right.score.adjustedElapsedMs) {
        return left.score.adjustedElapsedMs - right.score.adjustedElapsedMs;
      }
      if (left.team.totalHintsUsed !== right.team.totalHintsUsed) {
        return left.team.totalHintsUsed - right.team.totalHintsUsed;
      }
      return left.team.id - right.team.id;
    })
    .map(({ team, score }, index) => ({
      team,
      rank: index + 1,
      elapsedMs: score?.elapsedMs ?? null,
      adjustedElapsedMs: score?.adjustedElapsedMs ?? null,
    }));
}

export function formatDuration(milliseconds: number | null): string {
  if (milliseconds === null) return '—';
  const totalSeconds = Math.floor(milliseconds / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return [hours > 0 ? `${hours}h` : '', minutes > 0 || hours > 0 ? `${minutes}m` : '', `${seconds}s`]
    .filter(Boolean)
    .join(' ');
}

/** Includes the predecessor even when existing Firebase metadata predates sequential play. */
export function puzzleRequirements(id: number, configured: number[]): number[] {
  if (!Number.isInteger(id) || id < 1 || id > PUZZLE_IDS.length) throw new Error('Invalid puzzle.');
  return [...new Set([...configured, ...(id > 1 ? [id - 1] : [])])];
}

/** Validates saved hint counts before using them to enforce the team allowance. */
export function hintCount(value: unknown): number {
  if (value == null) return 0;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error('Saved hint usage is invalid.');
  }
  return value;
}

/** Returns the question limit without exceeding its provisioned hint content. */
export function puzzleHintLimit(value: unknown): number {
  if (value == null) throw new Error('Puzzle hint metadata is incomplete.');
  return Math.min(MAX_PUZZLE_HINTS, hintCount(value));
}

/** Rejects exhausted budgets before a hint transaction writes progress. */
export function assertHintAvailable(used: number, totalUsed: number, limit: number): void {
  if (used >= limit) throw new Error('No more hints remain for this fragment.');
  if (totalUsed >= MAX_TEAM_HINTS) throw new Error('Your team has used all 12 hints for this game.');
}
