import { useEffect } from 'react';
import { HashRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { restrictInspection } from './services/browserRestrictions';
import { AdminPage } from './pages/AdminPage';
import { CheckpointPage } from './pages/CheckpointPage';
import { ConvergencePage } from './pages/ConvergencePage';
import { DashboardPage } from './pages/DashboardPage';
import { CompletionPage } from './pages/EndgamePages';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { PuzzlePage } from './pages/PuzzlePage';
import { StoryPage } from './pages/StoryPage';
import { VaultPage } from './pages/VaultPage';
import { TeamProvider, useTeam } from './store/team';
import { useProgress } from './store/useProgress';
import { hasReleasedQuestion, nextRelease } from './services/gameClock';
import { ReleaseCountdown, useClockNow } from './components/GameClock';

function RequireTeam() {
  const { session } = useTeam();
  return session ? <Outlet /> : <Navigate to="/login" replace />;
}

function TeamReleaseBoundary() {
  const { session } = useTeam();
  const { pathname } = useLocation();
  return session && pathname !== '/admin' ? <ReleaseGate /> : <Outlet />;
}

function PublicEntry({ login = false }: { login?: boolean }) {
  const { session } = useTeam();
  return session ? <Navigate to="/dashboard" replace /> : login ? <LoginPage /> : <LandingPage />;
}

function ReleaseGate() {
  const { progress, error, refresh } = useProgress();
  const { pathname } = useLocation();
  const now = useClockNow();
  useEffect(() => {
    if (pathname !== '/waiting') return;
    const timer = window.setInterval(() => void refresh(), 15000);
    return () => window.clearInterval(timer);
  }, [pathname, refresh]);
  if (error) return <div className="flex min-h-dvh items-center justify-center bg-black p-6 text-center">
    <p role="alert" className="text-sm text-marigold">{error} <button className="underline" onClick={() => void refresh()}>Retry</button></p>
  </div>;
  if (!progress) return <div className="flex min-h-dvh items-center justify-center bg-black text-xs text-parchment/40">Gathering the light…</div>;
  if (!hasReleasedQuestion(progress.puzzles, now)) {
    if (pathname !== '/waiting') return <Navigate to="/waiting" replace />;
    const next = nextRelease(progress.puzzles, now);
    return <div className="flex min-h-dvh items-center justify-center bg-black px-4">
      {next?.unlockAt && <ReleaseCountdown target={Date.parse(next.unlockAt)} now={now} caption="Something stirs in the darkness. Your first flame is coming." />}
    </div>;
  }
  return pathname === '/waiting' ? <Navigate to="/dashboard" replace /> : <Outlet />;
}

// HashRouter so deep links work on GitHub Pages without server-side rewrites.
export function App() {
  useEffect(() => restrictInspection(document), []);
  return (
    <TeamProvider>
      <HashRouter>
        <Routes>
          <Route element={<TeamReleaseBoundary />}>
          <Route path="/" element={<PublicEntry />} />
          <Route path="/login" element={<PublicEntry login />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route element={<RequireTeam />}>
            <Route path="/waiting" element={null} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/story" element={<StoryPage />} />
            <Route path="/puzzle/:id" element={<PuzzlePage />} />
            <Route path="/checkpoint" element={<CheckpointPage />} />
            <Route path="/checkpoint/:code" element={<CheckpointPage />} />
            <Route path="/convergence" element={<ConvergencePage />} />
            <Route path="/vault" element={<VaultPage />} />
            <Route path="/complete" element={<CompletionPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </TeamProvider>
  );
}
