export const MAX_TEAM_HINTS = 12;
export const MAX_PUZZLE_HINTS = 3;
export const PUZZLE_IDS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

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
