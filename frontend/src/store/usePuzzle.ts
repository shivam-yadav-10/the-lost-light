import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { PuzzleDetail } from '../api/types';
import { useTeam } from './team';

/** Loads one puzzle for the signed-in team. */
export function usePuzzle(puzzleId: number) {
  const { session } = useTeam();
  const teamDocId = session?.teamDocId;
  const teamNumber = session?.teamId;
  const [puzzle, setPuzzle] = useState<PuzzleDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!teamDocId || teamNumber === undefined || !Number.isInteger(puzzleId)) return;
    let cancelled = false;
    let request = 0;
    const identity = { teamDocId, teamNumber };
    function load() {
      const current = ++request;
      api.puzzle(puzzleId, identity.teamDocId, identity.teamNumber)
      .then((p) => {
        if (!cancelled && current === request) { setPuzzle(p); setLoadError(null); }
      })
      .catch((err: unknown) => {
        if (!cancelled && current === request) setLoadError(err instanceof ApiError ? err.message : 'Could not load this fragment.');
      });
    }
    setPuzzle(null);
    setLoadError(null);
    load();
    window.addEventListener('lostlight:puzzle-display-refresh', load);
    return () => {
      cancelled = true;
      window.removeEventListener('lostlight:puzzle-display-refresh', load);
    };
  }, [teamDocId, teamNumber, puzzleId]);

  return { puzzle, setPuzzle, loadError };
}
