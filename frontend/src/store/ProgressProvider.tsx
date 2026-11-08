import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { TeamProgress } from '../api/types';
import { getTeamProgress, refreshPuzzleProgress, projectTeamProgress, clearProgressModel } from '../services/progressService';
import { useLocation } from 'react-router-dom';
import type { ProgressUpdate } from '../services/progressUpdates';
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
  const refreshMode = useRef<'full' | 'puzzles'>('full');
  const pendingUpdates = useRef<ProgressUpdate[]>([]);
  const { pathname } = useLocation();
  const teamDocId = session?.teamDocId;
  const teamNumber = session?.teamId;

  const runRefresh = useCallback(function runRefresh(mode: 'full' | 'puzzles'): Promise<void> {
    if (!teamDocId || teamNumber === undefined) return Promise.resolve();
    if (inFlight.current) {
      if (mode === 'full' && refreshMode.current === 'puzzles') {
        return inFlight.current.then(() => runRefresh('full'));
      }
      return inFlight.current;
    }
    refreshMode.current = mode;
    pendingUpdates.current = [];
    const request = async () => {
      setLoading(true);
      try {
        let next = mode === 'puzzles'
          ? await refreshPuzzleProgress(teamDocId)
          : await getTeamProgress(teamDocId, teamNumber);
        for (const update of pendingUpdates.current) {
          next = projectTeamProgress(teamDocId, update) ?? next;
        }
        pendingUpdates.current = [];
        setProgress(next);
        setError(null);
        if (mode === 'full') window.dispatchEvent(new Event('lostlight:puzzle-display-refresh'));
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
  }, [teamDocId, teamNumber, signOut]);
  const refresh = useCallback(() => runRefresh('full'), [runRefresh]);
  const refreshPuzzles = useCallback(() => runRefresh('puzzles'), [runRefresh]);

  useEffect(() => {
    void refresh();
    const removeShortcut = trapProgressRefresh(window, () => {
      clearStableContent();
      void refresh();
    });
    const refreshAfterUpdate = () => void refresh();
    const applyConfirmed = (event: Event) => {
      const update = (event as CustomEvent<ProgressUpdate>).detail;
      if (!teamDocId || update.teamDocId !== teamDocId) return;
      if (inFlight.current) pendingUpdates.current.push(update);
      try {
        const next = projectTeamProgress(teamDocId, update);
        if (next) { setProgress(next); setError(null); }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not update your progress. Refresh to reload.');
      }
    };
    window.addEventListener('lostlight:progress-confirmed', applyConfirmed);
    window.addEventListener('lostlight:progress-updated', refreshAfterUpdate);
    return () => {
      removeShortcut();
      clearStableContent(false);
      if (teamDocId) clearProgressModel(teamDocId);
      window.removeEventListener('lostlight:progress-confirmed', applyConfirmed);
      window.removeEventListener('lostlight:progress-updated', refreshAfterUpdate);
    };
  }, [refresh, teamDocId]);

  useEffect(() => {
    if (!progress || !teamDocId) return;
    const next = nextReleaseTime(progress.puzzles, Date.now());
    try {
      saveReleaseTime(window.sessionStorage, teamDocId, next);
    } catch (err) {
      console.warn('Could not save the release time in sessionStorage; the countdown will continue in memory.', err);
    }
    if (next === null) return;
    return scheduleReleaseRefresh(next, () => {
      if (pathname === '/waiting') void refresh();
      else {
        try {
          const local = projectTeamProgress(teamDocId);
          if (local) setProgress(local);
        } catch (err) { setError(err instanceof Error ? err.message : 'Could not update the release display.'); }
      }
    });
  }, [progress, refresh, teamDocId, pathname]);

  return <ProgressContext.Provider value={{ progress, error, loading, refresh, refreshPuzzles }}>{children}</ProgressContext.Provider>;
}
