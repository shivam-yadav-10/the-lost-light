import type { ContentBlock, FragmentMeta } from './content/types.js';

export type PuzzleKind = 'core' | 'convergence' | 'vault';
export type FragmentState = 'LOCKED' | 'AVAILABLE' | 'SOLVED';

export interface TeamRow {
  id: number;
  name: string;
  game_key: string;
  created_at: string;
  last_seen_at: string | null;
  intro_seen_at: string | null;
}

export interface PuzzleRow {
  id: number;
  slug: string;
  title: string;
  fragment_name: string;
  kind: PuzzleKind;
  sort_order: number;
  intro: string;
  body: string;
  answer: string;
  unlock_at: string | null;
  requires_puzzle_id: number | null;
  requires_json: string;
  max_hints: number;
}

export interface ProgressRow {
  team_id: number;
  puzzle_id: number;
  status: 'in_progress' | 'solved';
  hints_used: number;
  started_at: string;
  solved_at: string | null;
}

export interface CheckpointRow {
  id: number;
  code: string;
  title: string;
  message: string;
  puzzle_id: number | null;
}

/** Shape sent to clients: never includes `answer`. */
export interface PuzzleSummary {
  id: number;
  slug: string;
  title: string;
  fragmentName: string;
  kind: PuzzleKind;
  sortOrder: number;
  state: FragmentState;
  unlockAt: string | null;
  solvedAt: string | null;
  hintsUsed: number;
  maxHints: number;
}

export interface PuzzleDetail extends PuzzleSummary {
  intro: string;
  blocks: ContentBlock[];
  revealedHints: string[];
  /** The fragment card, only once this team has solved the puzzle. */
  fragment: FragmentMeta | null;
  completionMessage: string | null;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
