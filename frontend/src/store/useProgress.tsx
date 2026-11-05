import { createContext, useContext } from 'react';
import type { TeamProgress } from '../api/types';

interface ProgressContextValue {
  progress: TeamProgress | null;
  error: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

export const ProgressContext = createContext<ProgressContextValue | null>(null);

export function useProgress() {
  const value = useContext(ProgressContext);
  if (!value) throw new Error('useProgress must be used inside ProgressProvider');
  return value;
}
