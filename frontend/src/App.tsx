import { HashRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
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

function RequireTeam() {
  const { session } = useTeam();
  return session ? <Outlet /> : <Navigate to="/login" replace />;
}

// HashRouter so deep links work on GitHub Pages without server-side rewrites.
export function App() {
  return (
    <TeamProvider>
      <HashRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route element={<RequireTeam />}>
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
        </Routes>
      </HashRouter>
    </TeamProvider>
  );
}
