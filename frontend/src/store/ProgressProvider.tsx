import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { TeamProgress } from '../api/types';
import { getTeamProgress } from '../services/progressService';
import { TeamLoginError } from '../services/teamService';
import { useTeam } from './team';
import { ProgressContext } from './useProgress';
import { nextReleaseTime, saveReleaseTime, scheduleReleaseRefresh, trapProgressRefresh } from '../services/releaseRefresh';
import { clearStableContent } from '../services/stableContent';

export function ProgressProvider({ children }: { children: ReactNode }) {
  const { session, signOut } = useTeam();
  const [progress, setProgress] = useState<TeamProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const inFlight = useRef<Promise<void> | null>(null);

  const refresh = useCallback((): Promise<void> => {
    if (!session) return Promise.resolve();
    if (inFlight.current) return inFlight.current;
    const request = async () => {
      setLoading(true);
      try {
        const next = await getTeamProgress(session.teamDocId, session.teamId);
        setProgress(next);
        setError(null);
      } catch (err) {
        if (err instanceof TeamLoginError) signOut();
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
        inFlight.current = null;
      }
    };
    inFlight.current = request();
    return inFlight.current;
  }, [session, signOut]);

  useEffect(() => {
    void refresh();
    const removeShortcut = trapProgressRefresh(window, () => {
      clearStableContent();
      void refresh();
    });
    const refreshAfterUpdate = () => void refresh();
    window.addEventListener('lostlight:progress-updated', refreshAfterUpdate);
    return () => {
      removeShortcut();
      clearStableContent();
      window.removeEventListener('lostlight:progress-updated', refreshAfterUpdate);
    };
  }, [refresh]);

  useEffect(() => {
    if (!progress || !session) return;
    const next = nextReleaseTime(progress.puzzles, Date.now());
    try {
      saveReleaseTime(window.sessionStorage, session.teamDocId, next);
    } catch (err) {
      console.warn('Could not save the release time in sessionStorage; the countdown will continue in memory.', err);
    }
    if (next === null) return;
    return scheduleReleaseRefresh(next, () => void refresh());
  }, [progress, refresh, session]);

  return <ProgressContext.Provider value={{ progress, error, loading, refresh }}>{children}</ProgressContext.Provider>;
}
