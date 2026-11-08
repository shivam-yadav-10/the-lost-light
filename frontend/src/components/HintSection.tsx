import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';
import { useTeam } from '../store/team';
import { useProgress } from '../store/useProgress';
import { MAX_TEAM_HINTS } from '../services/gameRules';
import { DiyaLamp } from './DiyaLamp';

interface HintSectionProps {
  puzzleId: number;
  maxHints: number;
  hintsUsed: number;
  revealedHints: string[];
  onHints: (hints: string[], used: number) => void;
}

/** Revealed whispers plus the button to ask for the next one (each adds a time penalty). */
export function HintSection({ puzzleId, maxHints, hintsUsed, revealedHints, onHints }: HintSectionProps) {
  const { session } = useTeam();
  const [busy, setBusy] = useState(false);
  const asking = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const { progress, error: progressError, refresh } = useProgress();
  const [teamHintsUsed, setTeamHintsUsed] = useState<number | null>(null);
  useEffect(() => {
    if (progress) setTeamHintsUsed(progress.puzzles.reduce((sum, puzzle) => sum + puzzle.hintsUsed, 0));
  }, [progress]);
  const teamLeft = teamHintsUsed === null ? 0 : Math.max(0, MAX_TEAM_HINTS - teamHintsUsed);
  const left = Math.max(0, Math.min(maxHints - hintsUsed, teamLeft));

  async function ask() {
    if (!session || asking.current || left <= 0 || progressError) return;
    asking.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await api.hint(puzzleId, session.teamDocId);
      setTeamHintsUsed(result.teamHintsUsed);
      onHints(result.hints, result.hintsUsed);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No hint came.');
    } finally {
      asking.current = false;
      setBusy(false);
    }
  }

  if (maxHints === 0) return null;
  return (
    <section className="space-y-3" aria-label="Hints">
      {revealedHints.map((h, i) => (
        <div key={i} className="rounded-2xl border border-ember/20 bg-ember/5 px-6 py-4 text-base">
          <span className="eyebrow mr-3">Whisper {i + 1}</span>
          {h}
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-4 pt-1">
        <button type="button" className="btn-ghost" onClick={() => void ask()} disabled={busy || left <= 0 || Boolean(progressError)}>
          {busy ? 'Listening for your whisper...' : teamHintsUsed === null ? 'Loading hint allowance...' : left > 0 ? `Ask for a whisper (${left} left)` : 'No whispers remain'}
        </button>
        {teamHintsUsed !== null && <span className="text-xs text-parchment/60">{teamLeft} of 12 team hints remain across the game. Maximum 3 per question.</span>}
        {left > 0 && <span className="text-xs text-parchment/45">Each whisper adds time to your final result.</span>}
      </div>
      {busy && (
        <div role="status" aria-live="polite" aria-atomic="true"
          className="flex items-center gap-4 rounded-2xl border border-ember/20 bg-ember/5 px-5 py-3">
          <DiyaLamp state="SOLVED" size={48} className="shrink-0" />
          <div>
            <p className="text-sm text-ember-glow">A whisper is finding its way to your lantern...</p>
            <p className="mt-1 text-xs text-parchment/60">Keep exploring the question while it arrives. No need to ask again.</p>
          </div>
        </div>
      )}
      {progressError && <p role="alert" className="text-sm text-marigold">{progressError} <button type="button" className="underline" onClick={() => void refresh()}>Retry</button></p>}
      {error && (
        <p role="alert" className="text-sm text-marigold">
          {error}
        </p>
      )}
    </section>
  );
}
