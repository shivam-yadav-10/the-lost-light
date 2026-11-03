export const LANTERNS = ['lotus', 'star', 'leaf', 'bell', 'moon'] as const;
export type Lantern = typeof LANTERNS[number];
export type Mirror = 'slash' | 'backslash';
export interface Point { x: number; y: number }
export const COURTYARD_VERSION = 'courtyard-v3';
export const BOARD_COLUMNS = 25;
export const BOARD_ROWS = 11;
export const SOURCE: Point = { x: 13, y: 9 };
export const BEACON: Point = { x: 0, y: 1 };
export const GATES: readonly Point[] = [
  { x: 18, y: 9 }, { x: 23, y: 5 }, { x: 21, y: 4 }, { x: 19, y: 5 }, { x: 5, y: 2 },
];
export const MIRRORS: readonly Point[] = [
  { x: 23, y: 9 }, { x: 23, y: 1 }, { x: 21, y: 1 }, { x: 21, y: 7 }, { x: 19, y: 7 },
  { x: 19, y: 1 }, { x: 17, y: 1 }, { x: 17, y: 5 }, { x: 15, y: 5 }, { x: 15, y: 1 },
  { x: 13, y: 1 }, { x: 13, y: 7 }, { x: 11, y: 7 }, { x: 11, y: 3 }, { x: 9, y: 3 },
  { x: 9, y: 7 }, { x: 7, y: 7 }, { x: 7, y: 3 }, { x: 5, y: 3 }, { x: 5, y: 1 },
];
export const INITIAL_MIRRORS: Mirror[] = [
  'backslash', 'slash', 'slash', 'slash', 'backslash',
  'slash', 'slash', 'slash', 'backslash', 'slash',
  'slash', 'backslash', 'slash', 'slash', 'backslash',
  'slash', 'slash', 'backslash', 'slash', 'slash',
];

/** Changes corridor spacing without changing intersections or reflection rules. */
export function teamCourtyardPosition(teamId: string): (point: Point) => Point {
  if (!teamId.trim()) throw new Error('A team is required to arrange the courtyard.');
  let seed = 2166136261;
  for (const char of `courtyard-layout-v1:${teamId}`) {
    seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  }
  const random = () => {
    seed += 0x6D2B79F5;
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
  const xs = [0, 2 + random()];
  for (let i = 2; i < 11; i++) xs.push(xs[i - 1] + 2 + random() * 0.15);
  xs.push(24);
  const ys = [0, 0.6 + random() * 0.3];
  for (let i = 2; i < 6; i++) ys.push(ys[i - 1] + 2 + random() * 0.1);
  ys.push(10);
  const interpolate = (value: number, from: readonly number[], to: readonly number[]) => {
    const index = from.findIndex((coordinate) => coordinate >= value);
    if (index === -1) return to[to.length - 1] + value - from[from.length - 1];
    if (index === 0) return to[0] + value - from[0];
    const fraction = (value - from[index - 1]) / (from[index] - from[index - 1]);
    return to[index - 1] + fraction * (to[index] - to[index - 1]);
  };
  return ({ x, y }) => ({
    x: interpolate(x, [0, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 24], xs),
    y: interpolate(y, [0, 1, 3, 5, 7, 9, 10], ys),
  });
}

export function nextLantern(current: string): string {
  const cycle: readonly string[] = ['', ...LANTERNS];
  return cycle[(cycle.indexOf(current) + 1) % cycle.length];
}

/** Traces the diya's beam until it exits the courtyard or reaches the beacon. */
export function traceCourtyard(mirrors: readonly Mirror[]): { path: Point[]; gates: number[]; mirrorsVisited: number[]; reachedBeacon: boolean } {
  if (mirrors.length !== MIRRORS.length || mirrors.some((mirror) => mirror !== 'slash' && mirror !== 'backslash')) {
    throw new Error('Choose a valid orientation for all twenty mirrors.');
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
    throw new Error('Turn the mirrors so the light visits all five gates, all twenty mirrors and reaches the beacon.');
  }
  return [COURTYARD_VERSION, ...lanterns, mirrors.map((mirror) => mirror === 'slash' ? 's' : 'b').join('')].join(' ');
}
