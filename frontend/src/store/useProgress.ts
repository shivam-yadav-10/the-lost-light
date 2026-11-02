import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { TeamProgress } from '../api/types';
import { useTeam } from './team';

export function useProgress() {
  const { session, signOut } = useTeam();
  const [progress, setProgress] = useState<TeamProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      setProgress(await api.progress(session.gameKey));
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) signOut();
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [session, signOut]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { progress, error, loading, refresh };
}
