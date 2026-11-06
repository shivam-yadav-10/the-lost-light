import type { PuzzleSummary } from '../api/types';
import { GAMEPLAY_RUN } from './gameplayRun';

export function nextReleaseTime(puzzles: PuzzleSummary[], now: number): number | null {
  return puzzles.reduce<number | null>((earliest, puzzle) => {
    const time = puzzle.unlockAt ? Date.parse(puzzle.unlockAt) : NaN;
    return puzzle.state !== 'SOLVED' && Number.isFinite(time) && time > now
      && (earliest === null || time < earliest) ? time : earliest;
  }, null);
}

export function saveReleaseTime(storage: Storage, teamDocId: string, target: number | null): void {
  const key = `lostlight.release.${GAMEPLAY_RUN}.${teamDocId}`;
  if (target === null) storage.removeItem(key);
  else storage.setItem(key, String(target));
}

export function scheduleReleaseRefresh(target: number, refresh: () => void): () => void {
  let timer: ReturnType<typeof setTimeout>;
  function schedule() {
    timer = setTimeout(() => {
      if (Date.now() < target) schedule();
      else refresh();
    }, Math.min(2147483647, Math.max(0, target - Date.now()) + 100));
  }
  schedule();
  return () => clearTimeout(timer);
}

export function trapProgressRefresh(target: Window, refresh: () => void): () => void {
  const keydown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || !event.ctrlKey || !event.shiftKey || event.altKey || event.metaKey || event.key.toLowerCase() !== 'r') return;
    event.preventDefault();
    if (!event.repeat) refresh();
  };
  target.addEventListener('keydown', keydown);
  return () => target.removeEventListener('keydown', keydown);
}
