import { Link, Navigate, useLocation } from 'react-router-dom';
import type { FragmentState } from '../api/types';
import { CheckpointForm } from '../components/CheckpointForm';
import { DiyaRow } from '../components/DiyaRow';
import { useProgress } from '../store/useProgress';
import { useTeam } from '../store/team';
import { FragmentLedger } from './EndgamePages';
import { MAX_TEAM_HINTS } from '../services/gameRules';

export function DashboardPage() {
  const { session } = useTeam();
  const { progress, error, loading, refresh } = useProgress();
  const location = useLocation();

  const core = progress?.puzzles.filter((p) => p.kind === 'core') ?? [];
  const convergence = progress?.puzzles.find((p) => p.kind === 'convergence');
  const vault = progress?.puzzles.find((p) => p.kind === 'vault');
  const markers = progress?.checkpoints.length ?? 0;

  // Nobody on the team has seen the opening story yet (first login, or after a progress reset).
  // The story handoff must not loop back while cached progress catches up.
  const introDone = Boolean((location.state as { introDone?: boolean } | null)?.introDone);
  if (progress && !progress.introSeen && !introDone) return <Navigate to="/story" replace state={{ first: true }} />;

  return (
    <>
      {/* 70:30. Desktop: progress + diyas on the left, a sticky sidebar for code entry and the endgame.
          Mobile stacks: team name, code entry, then the diyas. */}
      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)] lg:gap-x-12 lg:gap-y-14">
        <section className="animate-rise lg:col-start-1 lg:row-start-1">
          <p className="eyebrow">Welcome back</p>
          <h1 className="text-shimmer mt-3 text-5xl lg:text-6xl">{session?.teamName}</h1>
          {progress && (
            <>
              <p className="mt-6 text-lg font-light text-parchment/65">
                <span className="font-display text-2xl text-ember-glow">{progress.coreSolved}</span>
                <span className="mx-1.5 text-parchment/40">/</span>
                {progress.coreTotal} diyas lit
                <span className="mx-3 text-parchment/30">·</span>
                Light restored <span className="font-display text-2xl text-ember-glow">{progress.lightPercent}%</span>
              </p>
              <p className="mt-2 text-sm text-parchment/60">
                {Math.max(0, MAX_TEAM_HINTS - progress.puzzles.reduce((sum, puzzle) => sum + puzzle.hintsUsed, 0))} of 12 team hints remain. Maximum 3 per question. Complete each question before the next.
              </p>
              <div className="mt-4 h-1 w-full max-w-sm overflow-hidden rounded-full bg-white/5" aria-hidden="true">
                <div
                  className="relative h-full overflow-hidden rounded-full bg-gradient-to-r from-ember-deep via-ember to-ember-glow transition-all duration-700"
                  style={{ width: `${progress.lightPercent}%` }}
                >
                  <span className="absolute inset-y-0 left-0 w-1/3 animate-bar-shimmer bg-gradient-to-r from-transparent via-white/70 to-transparent" />
                </div>
              </div>
              <Link
                to="/story"
                className="mt-6 inline-flex items-center gap-2 text-sm text-parchment/50 transition-colors hover:text-ember-glow focus-visible:text-ember-glow"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
                  <path d="M4 2.5v11a.5.5 0 0 0 .76.43l9-5.5a.5.5 0 0 0 0-.86l-9-5.5A.5.5 0 0 0 4 2.5Z" />
                </svg>
                Replay the story
              </Link>
            </>
          )}
        </section>

        <aside
          className="space-y-24 animate-rise lg:sticky lg:top-8 lg:col-start-2 lg:row-span-2 lg:row-start-1"
          style={{ animationDelay: '120ms' }}
          aria-label="Codes and the endgame"
        >
          <div className="card relative border-ember/40 !p-6 animate-pulse-glow">
            <CheckpointForm inputId="dashboard-code" stacked />
            <p className="mt-4 text-sm font-light text-parchment/50">
              {markers > 0
                ? `${markers} marker${markers === 1 ? '' : 's'} found so far.`
                : 'Codes are hidden around the office and inside puzzles.'}
            </p>
          </div>

          {progress && (
            <EndgameSection
              className="max-lg:hidden"
              convergence={convergence?.state ?? 'LOCKED'}
              vault={vault?.state ?? 'LOCKED'}
              gameComplete={progress.gameComplete}
            />
          )}
        </aside>

        <div className="space-y-16 lg:col-start-1 lg:row-start-2">
          {error && (
            <div role="alert" className="card border-marigold/40 text-sm text-marigold">
              {error}{' '}
              <button type="button" className="underline" onClick={() => void refresh()}>
                Retry
              </button>
            </div>
          )}

          {loading && !progress && <p className="text-center text-parchment/50">The lamps are being lit…</p>}

          {progress?.lightMessage && (
            <section role="status" className="card border-ember/50 text-center shadow-ember animate-rise" aria-label="Light restored">
              {progress.lightMessage.split('. ').map((line, i) => (
                <p key={i} className={i === 0 ? 'font-display text-2xl text-ember-glow lg:text-3xl' : 'mt-2 text-lg text-parchment/80'}>
                  {line.endsWith('.') ? line : `${line}.`}
                </p>
              ))}
              <Link to="/convergence" className="btn-ember mt-8">
                Seek what you lack
              </Link>
            </section>
          )}

          {progress && (
            <section aria-labelledby="diyas-heading">
              <h2 id="diyas-heading" className="eyebrow mb-10">
                The six diyas
              </h2>
              <DiyaRow puzzles={core} />
            </section>
          )}

          {progress && progress.fragments.length > 0 && (
            <FragmentLedger fragments={progress.fragments} heading="Recovered fragments" />
          )}

          {/* On small screens the endgame comes after the diyas rather than above them. */}
          {progress && (
            <EndgameSection
              className="lg:hidden"
              convergence={convergence?.state ?? 'LOCKED'}
              vault={vault?.state ?? 'LOCKED'}
              gameComplete={progress.gameComplete}
            />
          )}
        </div>
      </div>
    </>
  );
}

interface EndgameSectionProps {
  className: string;
  convergence: FragmentState;
  vault: FragmentState;
  gameComplete: boolean;
}

function EndgameSection({ className, convergence, vault, gameComplete }: EndgameSectionProps) {
  return (
    <section aria-label="When the six are one" className={className}>
      <h2 className="eyebrow mb-4">When the six are one</h2>
      <div className="flex flex-col gap-4">
        <EndgameRow title="The Convergence" subtitle="Light passed between teams" to="/convergence" state={convergence} />
        <EndgameRow title="The Final Vault" subtitle="Where the light is returned" to="/vault" state={vault} />
      </div>
      {gameComplete && (
        <Link to="/complete" className="btn-ember mt-6 w-full">
          See the ending
        </Link>
      )}
    </section>
  );
}

function EndgameRow({ title, subtitle, to, state }: { title: string; subtitle: string; to: string; state: FragmentState }) {
  const locked = state === 'LOCKED';
  const body = (
    <div
      className={[
        'card flex items-center justify-between gap-4 !p-5',
        locked ? 'opacity-50' : 'border-ember/50 hover:-translate-y-0.5 hover:border-ember hover:shadow-ember',
      ].join(' ')}
    >
      <div>
        <h3 className="text-lg text-parchment">{title}</h3>
        <p className="mt-0.5 text-sm font-light text-parchment/55">{subtitle}</p>
      </div>
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-parchment/55">
        {locked ? 'Sealed' : state === 'SOLVED' ? 'Done' : 'Open'}
      </span>
    </div>
  );
  return locked ? <div aria-disabled="true">{body}</div> : <Link to={to}>{body}</Link>;
}
