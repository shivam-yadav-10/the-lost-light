/**
 * Content model for The Lost Light.
 *
 * - `public.ts` holds player-facing text and visuals. The backend sends it only once a puzzle unlocks.
 * - `protected.ts` holds answers, hints, fragment metadata, codes and shard rules. Nothing in it is
 *   sent to a player except data that team has already earned.
 */

export type PuzzleKind = 'core' | 'convergence' | 'vault';
export type Spoke = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';
export type SymbolName = 'star' | 'crescent' | 'diamond' | 'ring' | 'flame' | 'spiral';
export type MandalaMotif = 'dot' | 'petal' | 'diamond' | 'teardrop' | 'bead' | 'circle';

export const SPOKES: Spoke[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export interface MandalaCell {
  spoke: Spoke;
  /** 1 = nearest the centre. */
  ring: number;
  letter: string;
  motif: MandalaMotif;
  colour: string;
  /** Degrees; 0 = pointing outward. */
  rotate: number;
  dots: number;
  scale: number;
}

/** A small diya placed in the street scene (scene coordinates 1200 × 720). */
export interface SceneLamp {
  x: number;
  y: number;
  letter: string;
  lit: boolean;
}

export type ErrandGroup = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

/** One line of a multi-riddle puzzle: the answer's word lengths and which letter (1-based) is marked. */
export interface RiddleLine {
  label: string;
  clue: string;
  lengths: number[];
  mark: number;
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'verse'; lines: string[] }
  | { type: 'note'; text: string }
  | { type: 'list'; title: string; items: string[] }
  | { type: 'riddles'; items: RiddleLine[] }
  | { type: 'courtyard'; clues: string[] }
  | { type: 'street'; caption: string; rangoli: MandalaCell[]; lamps: SceneLamp[] };

export interface PublicPuzzle {
  id: number;
  slug: string;
  title: string;
  fragmentName: string;
  kind: PuzzleKind;
  sortOrder: number;
  /** ISO UTC timestamp, or null for no time gate. */
  unlockAt: string | null;
  /** Puzzle ids that must be solved first. */
  requires: number[];
  intro: string;
  blocks: ContentBlock[];
  /**
   * Extra blocks shown only to teams in a given variant group (appended after `blocks`).
   * Teams are spread across the groups evenly by team id (see `variantKey` in protected.ts).
   */
  variants?: Record<string, ContentBlock[]>;
}

export interface FragmentMeta {
  symbol: SymbolName;
  number: number;
  direction: Spoke;
  keyword: string;
  colour: string;
}

export interface RateLimit {
  cooldownMs: number;
  maxWrong: number;
  windowMs: number;
  lockoutMs: number;
}

export interface ProtectedPuzzle {
  id: number;
  /** The first entry is the canonical answer. Empty for team-specific answers. */
  answers: string[];
  /** Team-specific answers: each variant group accepts only its own entries (keys match `variants`). */
  answersByGroup?: Record<string, string[]>;
  riddleAnswersByGroup?: Record<string, string[]>;
  hiddenWordsByGroup?: Record<string, string[]>;
  convergenceAnswersBySet?: Record<string, string>;
  overlayWord?: string;
  /** Shown when a team enters another group's answer. */
  otherGroupMessage?: string;
  /**
   * Tailored nudges. `answers` match the whole normalised answer;
   * `containsAny` matches if any listed word appears in it.
   */
  nearMisses: { answers?: string[]; containsAny?: string[]; message: string }[];
  incorrectMessage: string;
  completionMessage: string;
  hints: { text: string; penaltyMinutes: number }[];
  rateLimit: RateLimit;
  /** Fragment card awarded on solve (core puzzles only). */
  fragment?: FragmentMeta;
  /** True values behind a deliberately false fragment (used by the Convergence/Vault logic). */
  trueFragment?: FragmentMeta;
}

export interface CheckpointContent {
  code: string;
  title: string;
  message: string;
  puzzleId: number | null;
}

export type ShardType = 'A' | 'B' | 'C' | 'D';

export interface ShardContent {
  type: ShardType;
  name: string;
  text: string;
}
