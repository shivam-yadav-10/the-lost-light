export const EVENT_START_AT = '2026-11-10T07:30:00.000Z';

export interface ScoringInput {
  id: number;
  completedAt: string | null;
  penaltyMinutes: number;
  totalHintsUsed: number;
}

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

export function rankTeams<T extends ScoringInput>(teams: T[], startAt = EVENT_START_AT) {
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
