import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { EarnedFragment } from '../api/types';
import { DiyaLamp } from '../components/DiyaLamp';
import { HintSection } from '../components/HintSection';
import { HanoiTower } from '../components/HanoiTower';
import { Layout } from '../components/Layout';
import { SparkBurst } from '../components/SparkBurst';
import { SuccessOverlay } from '../components/SuccessOverlay';
import { useProgress } from '../store/useProgress';
import { usePuzzle } from '../store/usePuzzle';
import { useTeam } from '../store/team';
import { hanoiSolved } from '../services/hanoi';
import { FragmentLedger, SealedChamber } from './EndgamePages';

export function VaultPage() {
  const { progress, error } = useProgress();
  const entry = progress?.puzzles.find((p) => p.kind === 'vault');

  if (error) {
    return (
      <Layout>
        <p role="alert" className="card mt-10 text-marigold">
          {error}
        </p>
      </Layout>
    );
  }
  if (!progress) {
    return (
      <Layout>
        <p className="mt-16 text-center text-parchment/50">Approaching the light…</p>
      </Layout>
    );
  }
  if (!entry || entry.state === 'LOCKED') {
    return (
      <SealedChamber
        eyebrow="The Final Vault"
        title="Behind the last door"
        body="The light must be returned to where it was lost. This door stays shut a while longer."
      />
    );
  }
  return <VaultOpen puzzleId={entry.id} fragments={progress.fragments} />;
}

function VaultOpen({ puzzleId, fragments }: { puzzleId: number; fragments: EarnedFragment[] }) {
  const { session } = useTeam();
  const navigate = useNavigate();
  const { puzzle, setPuzzle, loadError } = usePuzzle(puzzleId);
  const [word, setWord] = useState('');
  const [proof, setProof] = useState('');
  const [moves, setMoves] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!session || !puzzle || !word.trim() || !proof.trim() || !hanoiSolved(moves)) return;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await api.submit(
        puzzle.id, session.teamDocId, session.teamId, word.trim(),
        JSON.stringify({ code: proof.trim(), moves }),
      );
      if (result.correct) {
        setOpened(true);
        setPuzzle({ ...puzzle, state: 'SOLVED', solvedAt: result.puzzle.solvedAt, completionMessage: result.message });
      } else {
        setFeedback(result.message);
      }
    } catch (err) {
      setFeedback(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <Layout>
        <p role="alert" className="card mt-10 text-marigold">
          {loadError}
        </p>
      </Layout>
    );
  }
  if (!puzzle) {
    return (
      <Layout>
        <p className="mt-16 text-center text-parchment/50">The Vault is listening…</p>
      </Layout>
    );
  }

  const solved = puzzle.state === 'SOLVED';
  return (
    <Layout>
      {opened && (
        <SuccessOverlay
          eyebrow="The Final Vault is open"
          title="The light is whole!"
          subtitle="It was never one flame. It was every flame."
          actionLabel="Step into the light"
          onClose={() => navigate('/complete')}
        />
      )}
      <Link to="/dashboard" className="text-xs text-parchment/60 hover:text-ember-glow">
        ← All fragments
      </Link>
      <section className="vault-entrance relative isolate mx-auto mt-14 flex max-w-3xl flex-col items-center text-center">
        <div className="vault-doorway" aria-hidden="true">
          <div className="vault-door vault-door-left" />
          <div className="vault-door vault-door-right" />
          <div className="vault-door-light" />
        </div>
        <div className="vault-beacon relative">
          <DiyaLamp state={solved ? 'SOLVED' : 'AVAILABLE'} size={130} igniteDelay={200} />
          {opened && <SparkBurst loop count={22} radius={140} />}
        </div>
        <p className="vault-title eyebrow mt-10">VIII · {puzzle.fragmentName}</p>
        <h1 className="vault-title text-shimmer mt-4 text-5xl lg:text-7xl">{puzzle.title}</h1>
        <p className="vault-invitation mt-8 max-w-xl text-xl font-light leading-relaxed text-parchment/75">{puzzle.intro}</p>
        {!solved && <p className="vault-invitation mt-5 text-xs uppercase tracking-[.25em] text-ember/60">
          Every fragment led you here. Carry the last seven flames.
        </p>}
      </section>

      <div className="vault-challenge mx-auto mt-14 max-w-3xl">
        {solved ? (
          <div className="card border-ember/60 text-center shadow-ember">
            <p className="text-xl text-ember-glow">{puzzle.completionMessage}</p>
            <Link to="/complete" className="btn-ember mt-8">
              Step into the light
            </Link>
          </div>
        ) : (
          <div className="space-y-8">
            <HanoiTower moves={moves} onChange={setMoves} />
            {hanoiSolved(moves) && (
            <form onSubmit={onSubmit} className="vault-final-form card space-y-6 border-ember/40" noValidate>
              <div>
                <label htmlFor="vault-word" className="eyebrow block">
                  Final word
                </label>
                <input
                  id="vault-word"
                  className="input-ember mt-3 font-display text-2xl uppercase tracking-[0.2em]"
                  value={word}
                  onChange={(e) => setWord(e.target.value)}
                  maxLength={60}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <div>
                <label htmlFor="vault-proof" className="eyebrow block">
                  Proof code
                </label>
                <input
                  id="vault-proof"
                  className="input-ember mt-3 font-code text-xl tracking-[0.3em]"
                  value={proof}
                  onChange={(e) => setProof(e.target.value)}
                  inputMode="numeric"
                  maxLength={20}
                  autoComplete="off"
                />
              </div>
              {feedback && (
                <p role="status" className="text-sm text-marigold">
                  {feedback}
                </p>
              )}
              <button type="submit" className="btn-ember w-full" disabled={busy || !word.trim() || !proof.trim()}>
                {busy ? 'The Vault listens…' : 'Open the Vault'}
              </button>
            </form>
            )}
            <HintSection
              puzzleId={puzzle.id}
              maxHints={puzzle.maxHints}
              hintsUsed={puzzle.hintsUsed}
              revealedHints={puzzle.revealedHints}
              onHints={(hints, used) => setPuzzle({ ...puzzle, revealedHints: hints, hintsUsed: used })}
            />
          </div>
        )}
      </div>

      <div className="mt-20">
        <FragmentLedger fragments={fragments} />
      </div>
    </Layout>
  );
}
