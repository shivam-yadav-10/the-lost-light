import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

const STORAGE_KEY = 'lostlight.session';

interface Session {
  gameKey: string;
  teamId: number;
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
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Session>;
    if (typeof parsed.gameKey !== 'string' || typeof parsed.teamName !== 'string') return null;
    return parsed as Session;
  } catch {
    return null;
  }
}

export function TeamProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(readStored);

  const signIn = useCallback((next: Session) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSession(next);
  }, []);

  const signOut = useCallback(() => {
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
