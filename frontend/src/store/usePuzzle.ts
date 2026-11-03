import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { PuzzleDetail } from '../api/types';
import { useTeam } from './team';

/** Loads one puzzle for the signed-in team. */
export function usePuzzle(puzzleId: number) {
  const { session } = useTeam();
  const [puzzle, setPuzzle] = useState<PuzzleDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!session || !Number.isInteger(puzzleId)) return;
    let cancelled = false;
    api
    .puzzle(puzzleId, session.teamDocId, session.teamId)
      .then((p) => {
        if (!cancelled) setPuzzle(p);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : 'Could not load this fragment.');
      });
    return () => {
      cancelled = true;
    };
  }, [session, puzzleId]);

  return { puzzle, setPuzzle, loadError };
}
