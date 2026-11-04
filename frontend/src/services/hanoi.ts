export const HANOI_DISKS = 6;
export const MAX_HANOI_MOVES = 4096;
export type HanoiPegs = [number[], number[], number[]];

export function hanoiPegs(moves: string): HanoiPegs {
  if (!/^(?:[0-2]{2})*$/.test(moves) || moves.length > MAX_HANOI_MOVES * 2) {
    throw new Error('The tower move record is invalid. Restart the tower.');
  }
  const pegs: HanoiPegs = [Array.from({ length: HANOI_DISKS }, (_, index) => HANOI_DISKS - index), [], []];
  for (let i = 0; i < moves.length; i += 2) {
    const from = Number(moves[i]);
    const to = Number(moves[i + 1]);
    const disk = pegs[from].at(-1);
    const target = pegs[to].at(-1);
    if (from === to || disk === undefined || (target !== undefined && disk > target)) {
      throw new Error('Move only the top disk, and never place a larger disk on a smaller one.');
    }
    pegs[from].pop();
    pegs[to].push(disk);
  }
  return pegs;
}

export function hanoiSolved(moves: string): boolean {
  return hanoiPegs(moves)[2].length === HANOI_DISKS;
}

export function parseVaultProof(raw: string | undefined): { code: string; moves: string } {
  let value: unknown;
  try {
    value = JSON.parse(raw ?? '');
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new Error('Complete the six-disk tower before opening the Vault.');
  }
  if (!value || typeof value !== 'object' || !('code' in value) || typeof value.code !== 'string'
    || !('moves' in value) || typeof value.moves !== 'string' || !hanoiSolved(value.moves)) {
    throw new Error('Complete the six-disk tower before opening the Vault.');
  }
  return { code: value.code.replace(/\D/g, ''), moves: value.moves };
}
