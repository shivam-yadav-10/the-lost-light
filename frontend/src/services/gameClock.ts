import type { PuzzleSummary } from '../api/types';

export function nextRelease(puzzles: PuzzleSummary[], now: number): PuzzleSummary | null {
  return puzzles
    .filter((puzzle) => puzzle.state !== 'SOLVED' && puzzle.unlockAt !== null && Date.parse(puzzle.unlockAt) > now)
    .sort((a, b) => Date.parse(a.unlockAt!) - Date.parse(b.unlockAt!) || a.id - b.id)[0] ?? null;
}

export function countdownParts(target: number, now: number): { label: string; value: string }[] {
  const seconds = Math.max(0, Math.ceil((target - now) / 1000));
  const days = Math.floor(seconds / 86400);
  return [
    ...(days ? [{ label: 'Days', value: String(days).padStart(2, '0') }] : []),
    { label: 'Hours', value: String(Math.floor(seconds / 3600) % 24).padStart(2, '0') },
    { label: 'Minutes', value: String(Math.floor(seconds / 60) % 60).padStart(2, '0') },
    { label: 'Seconds', value: String(seconds % 60).padStart(2, '0') },
  ];
}
