import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useTeam } from '../store/team';
import { Diya } from './Diya';
import { FloatingEmbers } from './FloatingEmbers';
import { Toran } from './Toran';
import { GameClock } from './GameClock';
import { FloatingLanterns } from './FloatingLanterns';

interface LayoutProps {
  children: ReactNode;
  /** Hide the team header (landing/login). */
  bare?: boolean;
  lanterns?: boolean;
}

// Pages that already show the code form inline.
const INLINE_CODE_ROUTES = ['/dashboard', '/checkpoint'];

export function Layout({ children, bare = false, lanterns = false }: LayoutProps) {
  const { session, signOut } = useTeam();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const showCodeButton = !INLINE_CODE_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));

  return (
    <div className="relative min-h-dvh overflow-hidden">
      <Toran />
      <FloatingEmbers />
      {lanterns && <div className="pointer-events-none fixed inset-0" aria-hidden="true"><FloatingLanterns /></div>}
      <div
        aria-hidden="true"
        className="rangoli pointer-events-none absolute -top-72 left-1/2 h-[900px] w-[900px] -translate-x-1/2 animate-spin-slow opacity-50"
      />
      {!bare && (
        <header className="relative z-10 mx-auto flex w-full max-w-[96rem] items-center justify-between px-5 pb-8 pt-14 sm:px-6 lg:px-10">
          <Link to="/dashboard" className="flex items-center gap-3" aria-label="Go to dashboard">
            <Diya size={34} />
            <span className="font-display text-xl tracking-wide text-ember-glow">The Lost Light</span>
          </Link>
          {session && (
            <div className="flex items-center gap-5 text-sm">
              <span className="text-parchment/60 max-sm:hidden">{session.teamName}</span>
              {showCodeButton && (
                <Link to="/checkpoint" className="btn-ember !px-5 !py-2 text-sm">
                  Enter code
                </Link>
              )}
              <button
                type="button"
                className="btn-ghost !px-4 !py-2 text-xs"
                onClick={() => {
                  signOut();
                  navigate('/');
                }}
              >
                Leave
              </button>
            </div>
          )}
        </header>
      )}
      <main className="relative z-10 mx-auto w-full max-w-[96rem] px-5 pb-24 pt-6 sm:px-6 lg:px-10">
        {!bare && session && pathname !== '/admin' && <GameClock />}
        {children}
      </main>
    </div>
  );
}
