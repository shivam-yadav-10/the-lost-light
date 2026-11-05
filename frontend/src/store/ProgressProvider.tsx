import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { TeamProgress } from '../api/types';
import { getTeamProgress } from '../services/progressService';
import { TeamLoginError } from '../services/teamService';
import { useTeam } from './team';
import { ProgressContext } from './useProgress';

export function ProgressProvider({ children }: { children: ReactNode }) {
  const { session, signOut } = useTeam();
  const [progress, setProgress] = useState<TeamProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      setProgress(await getTeamProgress(session.teamDocId, session.teamId));
      setError(null);
    } catch (err) {
      if (err instanceof TeamLoginError) signOut();
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [session, signOut]);

  useEffect(() => {
    void refresh();
    let lastAutoRefreshAt = Date.now();
    const refreshWhenActive = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastAutoRefreshAt < 1_000) return;
      lastAutoRefreshAt = now;
      void refresh();
    };

    document.addEventListener('visibilitychange', refreshWhenActive);
    window.addEventListener('focus', refreshWhenActive);
    const refreshAfterUpdate = () => void refresh();
    window.addEventListener('lostlight:progress-updated', refreshAfterUpdate);
    return () => {
      document.removeEventListener('visibilitychange', refreshWhenActive);
      window.removeEventListener('focus', refreshWhenActive);
      window.removeEventListener('lostlight:progress-updated', refreshAfterUpdate);
    };
  }, [refresh]);

  useEffect(() => {
    if (!progress) return;
    const next = progress.puzzles
      .filter((puzzle) => puzzle.state !== 'SOLVED' && puzzle.unlockAt && Date.parse(puzzle.unlockAt) > Date.now())
      .map((puzzle) => Date.parse(puzzle.unlockAt!))
      .sort((a, b) => a - b)[0];
    if (next === undefined) return;
    const timer = window.setTimeout(() => void refresh(), Math.min(2147483647, Math.max(0, next - Date.now()) + 100));
    return () => window.clearTimeout(timer);
  }, [progress, refresh]);

  return <ProgressContext.Provider value={{ progress, error, loading, refresh }}>{children}</ProgressContext.Provider>;
}
