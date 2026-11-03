export const LANTERNS = ['lotus', 'star', 'leaf', 'bell', 'moon'] as const;
export type Lantern = typeof LANTERNS[number];
export type Mirror = 'slash' | 'backslash';
export interface Point { x: number; y: number }
export const SOURCE: Point = { x: 3, y: 3 };
export const BEACON: Point = { x: 0, y: 6 };
export const GATES: readonly Point[] = [
  { x: 5, y: 3 }, { x: 6, y: 2 }, { x: 4, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 3 },
];
export const MIRRORS: readonly Point[] = [{ x: 6, y: 3 }, { x: 6, y: 0 }, { x: 0, y: 0 }];
export const INITIAL_MIRRORS: Mirror[] = ['backslash', 'backslash', 'slash'];

/** Traces the diya's beam until it exits the courtyard or reaches the beacon. */
export function traceCourtyard(mirrors: readonly Mirror[]): { path: Point[]; gates: number[]; reachedBeacon: boolean } {
  if (mirrors.length !== 3 || mirrors.some((mirror) => mirror !== 'slash' && mirror !== 'backslash')) {
    throw new Error('Choose a valid orientation for all three mirrors.');
  }
  const path = [{ ...SOURCE }];
  const gates: number[] = [];
  let { x, y } = SOURCE;
  let dx = 1;
  let dy = 0;
  for (let step = 0; step < 100; step++) {
    x += dx;
    y += dy;
    path.push({ x, y });
    if (x < 0 || x > 6 || y < 0 || y > 6) return { path, gates, reachedBeacon: false };
    const gate = GATES.findIndex((point) => point.x === x && point.y === y);
    if (gate !== -1) gates.push(gate);
    if (x === BEACON.x && y === BEACON.y) return { path, gates, reachedBeacon: true };
    const mirror = MIRRORS.findIndex((point) => point.x === x && point.y === y);
    if (mirror !== -1) [dx, dy] = mirrors[mirror] === 'slash' ? [-dy, -dx] : [dy, dx];
  }
  throw new Error('The beam could not finish its path.');
}

/** Validates the board and encodes its arrangement for the existing answer service. */
export function courtyardAnswer(lanterns: readonly string[], mirrors: readonly Mirror[]): string {
  if (lanterns.length !== 5 || lanterns.some((lantern) => !LANTERNS.some((id) => id === lantern))) {
    throw new Error('Choose a lantern for each of the five gates.');
  }
  if (new Set(lanterns).size !== 5) throw new Error('Use each lantern exactly once.');
  const beam = traceCourtyard(mirrors);
  if (!beam.reachedBeacon || new Set(beam.gates).size !== 5) {
    throw new Error('Turn the mirrors so the light visits all five gates and reaches the beacon.');
  }
  return ['courtyard-v1', ...lanterns, ...mirrors].join(' ');
}
