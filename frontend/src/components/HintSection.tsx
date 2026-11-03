import { useState } from 'react';
import { api, ApiError } from '../api/client';
import { useTeam } from '../store/team';

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
  const [error, setError] = useState<string | null>(null);
  const left = maxHints - hintsUsed;

  async function ask() {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.hint(puzzleId, session.teamDocId);
      onHints(result.hints, result.hintsUsed);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No hint came.');
    } finally {
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
        <button type="button" className="btn-ghost" onClick={() => void ask()} disabled={busy || left <= 0}>
          {left > 0 ? `Ask for a whisper (${left} left)` : 'No whispers remain'}
        </button>
        {left > 0 && <span className="text-xs text-parchment/45">Each whisper adds time to your final result.</span>}
      </div>
      {error && (
        <p role="alert" className="text-sm text-marigold">
          {error}
        </p>
      )}
    </section>
  );
}
