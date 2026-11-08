import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { resetPreviousRunStorage, clearSessionContent } from '../services/gameplayRun';

const STORAGE_KEY = 'lostlight.session';

interface Session {
  teamId: number;
  teamDocId: string;
  teamName: string;
}

interface TeamContextValue {
  session: Session | null;
  signIn: (session: Session) => void;
  signOut: () => void;
}

const TeamContext = createContext<TeamContextValue | null>(null);

function readStored(): Session | null {
  try {
    resetPreviousRunStorage(localStorage, sessionStorage);
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Session>;
    if (
      typeof parsed.teamId !== 'number' ||
      typeof parsed.teamDocId !== 'string' ||
      typeof parsed.teamName !== 'string'
    ) {
      return null;
    }
    const session = {
      teamId: parsed.teamId,
      teamDocId: parsed.teamDocId,
      teamName: parsed.teamName,
    };
    if ('gameKey' in parsed) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    return session;
  } catch {
    return null;
  }
}

export function TeamProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(readStored);

  const signIn = useCallback((next: Session) => {
    clearSessionContent();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSession(next);
  }, []);

  const signOut = useCallback(() => {
    clearSessionContent();
    localStorage.removeItem(STORAGE_KEY);
    setSession(null);
  }, []);

  const value = useMemo(() => ({ session, signIn, signOut }), [session, signIn, signOut]);
  return <TeamContext.Provider value={value}>{children}</TeamContext.Provider>;
}

export function useTeam(): TeamContextValue {
  const ctx = useContext(TeamContext);
  if (!ctx) throw new Error('useTeam must be used inside TeamProvider');
  return ctx;
}
