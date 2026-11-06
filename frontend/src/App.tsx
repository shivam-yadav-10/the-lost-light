import { Component, lazy, Suspense, useEffect, useMemo, type ErrorInfo, type ReactNode } from 'react';
import { HashRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { restrictInspection } from './services/browserRestrictions';
import { LandingPage } from './pages/LandingPage';
import { TeamProvider, useTeam } from './store/team';
import { useProgress } from './store/useProgress';
import { hasReleasedQuestion, nextRelease } from './services/gameClock';
import { ReleaseCountdown, useClockNow } from './components/GameClock';
import { WaitingRoom } from './components/WaitingRoom';
import { Layout } from './components/Layout';

const AdminPage = lazy(() => import('./pages/AdminPage').then((module) => ({ default: module.AdminPage })));
const CheckpointPage = lazy(() => import('./pages/CheckpointPage').then((module) => ({ default: module.CheckpointPage })));
const ConvergencePage = lazy(() => import('./pages/ConvergencePage').then((module) => ({ default: module.ConvergencePage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })));
const CompletionPage = lazy(() => import('./pages/EndgamePages').then((module) => ({ default: module.CompletionPage })));
const LoginPage = lazy(() => import('./pages/LoginPage').then((module) => ({ default: module.LoginPage })));
const PuzzlePage = lazy(() => import('./pages/PuzzlePage').then((module) => ({ default: module.PuzzlePage })));
const StoryPage = lazy(() => import('./pages/StoryPage').then((module) => ({ default: module.StoryPage })));
const VaultPage = lazy(() => import('./pages/VaultPage').then((module) => ({ default: module.VaultPage })));
const ProgressProvider = lazy(() => import('./store/ProgressProvider').then((module) => ({ default: module.ProgressProvider })));

function PageLoading() {
  return <Layout bare>
    <div role="status" className="flex min-h-[60dvh] flex-col items-center justify-center gap-5">
      <span aria-hidden="true" className="h-8 w-8 animate-spin rounded-full border border-ember/20 border-t-ember-glow" />
      <p className="text-sm text-parchment/50">Opening your path…</p>
    </div>
  </Layout>;
}

class PageErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Could not render the requested page.', error, info.componentStack);
  }

  render() {
    if (this.state.failed) return <Layout bare>
      <div role="alert" className="card mx-auto mt-16 max-w-xl text-center text-marigold">
        <p>This page could not be loaded. Check your connection and reload.</p>
        <button type="button" className="mt-5 underline" onClick={() => window.location.reload()}>Reload</button>
      </div>
    </Layout>;
    return this.props.children;
  }
}

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
  const checkedAt = useMemo(() => Date.now(), [progress]);
  function content(): ReactNode {
  if (error) return <Layout bare>
    <p role="alert" className="text-sm text-marigold">{error} <button className="underline" onClick={() => void refresh()}>Retry</button></p>
  </Layout>;
  if (!progress) return <Layout>
    <div role="status" className="flex min-h-[60dvh] flex-col items-center justify-center gap-5">
      <span aria-hidden="true" className="h-8 w-8 animate-spin rounded-full border border-ember/20 border-t-ember-glow" />
      <p className="text-sm text-parchment/50">Opening your team&apos;s path…</p>
    </div>
  </Layout>;
  if (!hasReleasedQuestion(progress.puzzles, checkedAt)) {
    const next = nextRelease(progress.puzzles, checkedAt);
    return <WaitingRoom>
      {pathname !== '/waiting' && <Navigate to="/waiting" replace />}
      {next?.unlockAt && <ReleaseCountdown target={Date.parse(next.unlockAt)} now={now} caption="Something stirs in the darkness. Your first flame is coming." />}
    </WaitingRoom>;
  }
  return pathname === '/waiting' ? <Navigate to="/dashboard" replace /> : <Outlet />;
  }
  return content();
}

// HashRouter so deep links work on GitHub Pages without server-side rewrites.
export function App() {
  useEffect(() => restrictInspection(document), []);
  return (
    <TeamProvider>
      <HashRouter>
        <PageErrorBoundary>
        <Suspense fallback={<PageLoading />}>
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
        </Suspense>
        </PageErrorBoundary>
      </HashRouter>
    </TeamProvider>
  );
}
