export type FragmentState = 'LOCKED' | 'AVAILABLE' | 'SOLVED';
export type PuzzleKind = 'core' | 'convergence' | 'vault';

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

export type Spoke = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';
export type SymbolName = 'star' | 'crescent' | 'diamond' | 'ring' | 'flame' | 'spiral';
export type MandalaMotif = 'dot' | 'petal' | 'diamond' | 'teardrop' | 'bead' | 'circle';
export interface MandalaCell {
  spoke: Spoke;
  ring: number;
  letter: string;
  motif: MandalaMotif;
  colour: string;
  rotate: number;
  dots: number;
  scale: number;
}

/** Player-facing content blocks rendered by PuzzleBlocks. Supplied by the API only after unlock. */
export interface SceneLamp {
  x: number;
  y: number;
  letter: string;
  lit: boolean;
}

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

export interface FragmentMeta {
  symbol: SymbolName;
  number: number;
  direction: Spoke;
  keyword: string;
  colour: string;
}

export interface EarnedFragment extends FragmentMeta {
  puzzleId: number;
  numeral: string;
  title: string;
}

export interface PuzzleDetail extends PuzzleSummary {
  intro: string;
  blocks: ContentBlock[];
  revealedHints: string[];
  fragment: FragmentMeta | null;
  completionMessage: string | null;
}

export interface TeamProgress {
  teamId: number;
  teamName: string;
  /** False until someone on the team has finished or skipped the opening story. */
  introSeen: boolean;
  puzzles: PuzzleSummary[];
  coreSolved: number;
  coreTotal: number;
  allCoreSolved: boolean;
  gameComplete: boolean;
  lightPercent: number;
  lightMessage: string | null;
  fragments: EarnedFragment[];
  checkpoints: { code: string; title: string; visitedAt: string }[];
  scheduleStartAt: string;
  totalHintsUsed: number;
  penaltyMinutes: number;
  vaultSolvedAt: string | null;
  elapsedMs: number | null;
  adjustedElapsedMs: number | null;
}

export interface SubmitResult {
  correct: boolean;
  message: string;
  fragment: FragmentMeta | null;
  puzzle: PuzzleSummary;
}

export interface ShardRule {
  type: 'A' | 'B' | 'C' | 'D';
  name: string;
  text: string;
}

export interface LanternCell {
  spoke: Spoke;
  ring: number;
  flame: number;
  shadow: number;
  mark: SymbolName;
}

export interface ConvergenceState {
  ownId: string;
  seal: string;
  card: OverlayCard;
  partners: { teamId: string; name: string; arrived: boolean; verified: boolean; card: OverlayCard | null }[];
}

export interface SealResult {
  partnerName: string;
  alreadyHeld: boolean;
}

export interface OverlayCard { width: number; height: number; lit: number[] }
export interface OverlayPlacement { teamId: string; x: number; y: number; rotation: number }

export interface HintResult {
  hintsUsed: number;
  teamHintsUsed: number;
  maxHints: number;
  hints: string[];
}

export interface CheckpointResult {
  title: string;
  message: string;
  puzzleId: number | null;
  alreadyVisited: boolean;
}

export interface AdminOverview {
  generatedAt: string;
  puzzles: { id: number; title: string; fragmentName: string; kind: PuzzleKind; unlockAt: string | null; scheduleLocked: boolean }[];
  keeperSeals: { type: string; name: string; seal: string; holders: number }[];
  teams: {
    id: number;
    name: string;
    lastSeenAt: string | null;
    shardType: string | null;
    errandGroup: string;
    errandLocation: string;
    riddleSet: string;
    verifiedShards: string[];
    lanternKey: string;
    rank: number;
    totalHintsUsed: number;
    penaltyMinutes: number;
    vaultSolvedAt: string | null;
    elapsedMs: number | null;
    adjustedElapsedMs: number | null;
    puzzles: {
      puzzleId: number;
      state: FragmentState;
      hintsUsed: number;
      attempts: number;
      startedAt: string | null;
      solvedAt: string | null;
    }[];
  }[];
}
