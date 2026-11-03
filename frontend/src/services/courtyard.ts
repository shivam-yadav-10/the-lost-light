export const LANTERNS = ['lotus', 'star', 'leaf', 'bell', 'moon'] as const;
export type Lantern = typeof LANTERNS[number];
export type Mirror = 'slash' | 'backslash';
export interface Point { x: number; y: number }
export const COURTYARD_VERSION = 'courtyard-v2';
export const BOARD_COLUMNS = 13;
export const BOARD_ROWS = 11;
export const SOURCE: Point = { x: 1, y: 9 };
export const BEACON: Point = { x: 0, y: 1 };
export const GATES: readonly Point[] = [
  { x: 6, y: 9 }, { x: 11, y: 5 }, { x: 9, y: 4 }, { x: 7, y: 5 }, { x: 3, y: 2 },
];
export const MIRRORS: readonly Point[] = [
  { x: 11, y: 9 }, { x: 11, y: 1 }, { x: 9, y: 1 }, { x: 9, y: 7 }, { x: 7, y: 7 },
  { x: 7, y: 1 }, { x: 5, y: 1 }, { x: 5, y: 5 }, { x: 3, y: 5 }, { x: 3, y: 1 },
];
export const INITIAL_MIRRORS: Mirror[] = [
  'backslash', 'slash', 'slash', 'slash', 'backslash',
  'slash', 'slash', 'slash', 'backslash', 'slash',
];

export function nextLantern(current: string): string {
  const cycle: readonly string[] = ['', ...LANTERNS];
  return cycle[(cycle.indexOf(current) + 1) % cycle.length];
}

/** Traces the diya's beam until it exits the courtyard or reaches the beacon. */
export function traceCourtyard(mirrors: readonly Mirror[]): { path: Point[]; gates: number[]; mirrorsVisited: number[]; reachedBeacon: boolean } {
  if (mirrors.length !== MIRRORS.length || mirrors.some((mirror) => mirror !== 'slash' && mirror !== 'backslash')) {
    throw new Error('Choose a valid orientation for all ten mirrors.');
  }
  const path = [{ ...SOURCE }];
  const gates: number[] = [];
  const mirrorsVisited: number[] = [];
  const seen = new Set<string>();
  let { x, y } = SOURCE;
  let dx = 1;
  let dy = 0;
  while (true) {
    const state = `${x},${y},${dx},${dy}`;
    if (seen.has(state)) return { path, gates, mirrorsVisited, reachedBeacon: false };
    seen.add(state);
    x += dx;
    y += dy;
    path.push({ x, y });
    if (x < 0 || x >= BOARD_COLUMNS || y < 0 || y >= BOARD_ROWS) return { path, gates, mirrorsVisited, reachedBeacon: false };
    const gate = GATES.findIndex((point) => point.x === x && point.y === y);
    if (gate !== -1) gates.push(gate);
    if (x === BEACON.x && y === BEACON.y) return { path, gates, mirrorsVisited, reachedBeacon: true };
    const mirror = MIRRORS.findIndex((point) => point.x === x && point.y === y);
    if (mirror !== -1) {
      mirrorsVisited.push(mirror);
      [dx, dy] = mirrors[mirror] === 'slash' ? [-dy, -dx] : [dy, dx];
    }
  }
}

/** Validates the board and encodes its arrangement for the existing answer service. */
export function courtyardAnswer(lanterns: readonly string[], mirrors: readonly Mirror[]): string {
  if (lanterns.length !== 5 || lanterns.some((lantern) => !LANTERNS.some((id) => id === lantern))) {
    throw new Error('Choose a lantern for each of the five gates.');
  }
  if (new Set(lanterns).size !== 5) throw new Error('Use each lantern exactly once.');
  const beam = traceCourtyard(mirrors);
  if (!beam.reachedBeacon || new Set(beam.gates).size !== 5 || new Set(beam.mirrorsVisited).size !== MIRRORS.length) {
    throw new Error('Turn the mirrors so the light visits all five gates, all ten mirrors and reaches the beacon.');
  }
  return [COURTYARD_VERSION, ...lanterns, ...mirrors].join(' ');
}
