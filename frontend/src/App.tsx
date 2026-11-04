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
import { ProgressProvider, useProgress } from './store/useProgress';
import { hasReleasedQuestion, nextRelease } from './services/gameClock';
import { ReleaseCountdown, useClockNow } from './components/GameClock';
import { WaitingRoom } from './components/WaitingRoom';
import { Layout } from './components/Layout';

function RequireTeam() {
  const { session } = useTeam();
  return session ? <Outlet /> : <Navigate to="/login" replace />;
}

function TeamReleaseBoundary() {
  const { session } = useTeam();
  const { pathname } = useLocation();
  return session && pathname !== '/admin'
    ? <ProgressProvider key={session.teamDocId}><ReleaseGate /></ProgressProvider>
    : <Outlet />;
}

function PublicEntry() {
  const { session } = useTeam();
  return session ? <Navigate to="/dashboard" replace /> : <Layout bare lanterns><Outlet /></Layout>;
}

function GamePageLayout() {
  const { pathname } = useLocation();
  return <Layout>
    <div key={pathname} className="game-page-enter min-h-[60dvh]">
      <Outlet />
    </div>
  </Layout>;
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
  if (error) return <WaitingRoom>
    <p role="alert" className="text-sm text-marigold">{error} <button className="underline" onClick={() => void refresh()}>Retry</button></p>
  </WaitingRoom>;
  if (!progress) return <Layout bare lanterns>
    <div role="status" className="flex min-h-[80dvh] flex-col items-center justify-center gap-5">
      <span aria-hidden="true" className="h-8 w-8 animate-spin rounded-full border border-ember/20 border-t-ember-glow" />
      <p className="text-xs tracking-wide text-parchment/50">Opening your team&apos;s path…</p>
    </div>
  </Layout>;
  if (!hasReleasedQuestion(progress.puzzles, now)) {
    if (pathname !== '/waiting') return <Navigate to="/waiting" replace />;
    const next = nextRelease(progress.puzzles, now);
    return <WaitingRoom>
      {next?.unlockAt && <ReleaseCountdown target={Date.parse(next.unlockAt)} now={now} caption="Something stirs in the darkness. Your first flame is coming." />}
    </WaitingRoom>;
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
          <Route element={<PublicEntry />}>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
          </Route>
          <Route path="/admin" element={<AdminPage />} />
          <Route element={<RequireTeam />}>
            <Route path="/waiting" element={null} />
            <Route element={<GamePageLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/puzzle/:id" element={<PuzzlePage />} />
            </Route>
            <Route path="/story" element={<StoryPage />} />
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
