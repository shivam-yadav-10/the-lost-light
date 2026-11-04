import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { ConvergenceState, EarnedFragment, OverlayPlacement } from '../api/types';
import { HintSection } from '../components/HintSection';
import { LanternOverlay } from '../components/LanternOverlay';
import { Layout } from '../components/Layout';
import { PuzzleBlocks } from '../components/PuzzleBlocks';
import { SuccessOverlay } from '../components/SuccessOverlay';
import { cardsAligned } from '../services/convergenceOverlay';
import { useProgress } from '../store/useProgress';
import { usePuzzle } from '../store/usePuzzle';
import { useTeam } from '../store/team';
import { FragmentLedger, SealedChamber } from './EndgamePages';

export function ConvergencePage() {
  const { progress, error } = useProgress();
  const entry = progress?.puzzles.find((p) => p.kind === 'convergence');
  if (error) return <Layout><p role="alert" className="card mt-10 text-marigold">{error}</p></Layout>;
  if (!progress) return <Layout><p className="mt-16 text-center text-parchment/50">Approaching the light…</p></Layout>;
  if (!entry || entry.state === 'LOCKED') return <SealedChamber eyebrow="The Convergence"
    title="This chamber is sealed" body="Recover all six fragments, and this door will open on its own." />;
  return <ConvergenceOpen puzzleId={entry.id} fragments={progress.fragments} />;
}

function ConvergenceOpen({ puzzleId, fragments }: { puzzleId: number; fragments: EarnedFragment[] }) {
  const { session } = useTeam();
  const { puzzle, setPuzzle, loadError } = usePuzzle(puzzleId);
  const [state, setState] = useState<ConvergenceState | null>(null);
  const [stateError, setStateError] = useState<string | null>(null);
  const [placements, setPlacements] = useState<OverlayPlacement[]>([]);
  const [seal, setSeal] = useState('');
  const [word, setWord] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const closeCelebration = useCallback(() => setCelebrate(false), []);
  const loadState = useCallback(async () => {
    if (!session) return;
    try { setState(await api.convergence(session.teamDocId)); setStateError(null); }
    catch (err) { setStateError(err instanceof Error ? err.message : 'The lantern will not light.'); }
  }, [session]);
  useEffect(() => { void loadState(); }, [loadState]);

  async function verify(event: FormEvent) {
    event.preventDefault();
    if (!session || busy) return;
    setBusy(true); setFeedback(null);
    try {
      const result = await api.verifySeal(session.teamDocId, seal.trim());
      setFeedback(result.alreadyHeld ? `${result.partnerName}'s card is already open.` : `${result.partnerName}'s card is open.`);
      setSeal(''); await loadState();
    } catch (err) { setFeedback(err instanceof Error ? err.message : 'The seal could not be tested.'); }
    finally { setBusy(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!session || !puzzle || busy) return;
    setBusy(true); setFeedback(null);
    try {
      const result = await api.submit(puzzleId, session.teamDocId, session.teamId, word.trim(), JSON.stringify(placements));
      if (result.correct) {
        setPuzzle({ ...puzzle, state: 'SOLVED', solvedAt: result.puzzle.solvedAt, completionMessage: result.message });
        setCelebrate(true);
      } else setFeedback(result.message);
    } catch (err) { setFeedback(err instanceof ApiError ? err.message : 'The word could not be offered.'); }
    finally { setBusy(false); }
  }
  if (loadError) return <Layout><p role="alert" className="card mt-10 text-marigold">{loadError}</p></Layout>;
  if (!puzzle) return <Layout><p className="mt-16 text-center">The lanterns are gathering…</p></Layout>;
  const solved = puzzle.state === 'SOLVED';
  const ready = state && state.partners.every((p) => p.verified)
    && cardsAligned(placements, state.partners.map((p) => p.teamId));
  return (
    <Layout>
      {celebrate && <SuccessOverlay eyebrow="The Convergence" title="The lanterns become one!"
        subtitle="Your key is now your proof. The Vault awaits." onClose={closeCelebration} />}
      <Link to="/dashboard" className="text-xs text-parchment/60 hover:text-ember-glow">← All fragments</Link>
      <header className="mt-10 max-w-3xl">
        <p className="eyebrow">VII · {puzzle.fragmentName}</p>
        <h1 className="mt-4 text-5xl text-ember-glow">{puzzle.title}</h1>
        {!solved && <><p className="mt-6 text-lg text-parchment/70">{puzzle.intro}</p>
          <div className="mt-8"><PuzzleBlocks blocks={puzzle.blocks} /></div></>}
      </header>
      {solved ? <div className="card mt-10 border-ember/60 text-center">
        <p className="text-xl text-ember-glow">{puzzle.completionMessage}</p>
        <Link to="/vault" className="btn-ember mt-8">Approach the Vault</Link>
      </div> : <>
        {stateError && <p role="alert" className="card mt-8 text-marigold">{stateError}
          <button type="button" className="btn-ghost ml-4" onClick={() => void loadState()}>Retry</button></p>}
        {!state && !stateError && <p className="mt-8">Opening your lantern circle…</p>}
        {state && <div className="mt-10 grid items-start gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
          <aside className="min-w-0 space-y-6 lg:sticky lg:top-8 lg:col-start-2 lg:row-start-1" aria-label="Your circle and partner seals">
          <section className="card !p-6">
            <h2 className="eyebrow">Your circle</h2>
            <p className="mt-4">Your seal: give it to {state.partners.map((p) => p.name).join(' and ')}.</p>
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <code className="break-all font-code text-lg tracking-widest text-ember-glow">{state.seal}</code>
              <button type="button" className="btn-ghost" onClick={() => {
                void navigator.clipboard.writeText(state.seal).then(() => setFeedback('Seal copied.'),
                  () => setFeedback('Select and copy the seal shown above.'));
              }}>Copy seal</button>
            </div>
            <ul className="mt-5 space-y-3">{state.partners.map((partner) => <li key={partner.teamId}>
              <strong>{partner.name}</strong> · {partner.verified ? 'Card unlocked' : partner.arrived
                ? 'Has arrived · exchange seals' : 'Has not reached this chamber yet'}
            </li>)}</ul>
            <button type="button" className="btn-ghost mt-4" disabled={busy} onClick={() => void loadState()}>Refresh arrivals</button>
          </section>
          {!state.partners.every((p) => p.verified) && <form onSubmit={verify} className="card !p-6">
            <label htmlFor="seal" className="eyebrow">A partner's seal</label>
            <div className="mt-4 flex flex-col gap-3">
              <input id="seal" className="input-ember min-w-0 font-code uppercase" value={seal}
                onChange={(e) => setSeal(e.target.value)} autoComplete="off" spellCheck={false} maxLength={40} />
              <button type="submit" className="btn-ember" disabled={busy || !seal.trim()}>Open card</button>
            </div>
          </form>}
          {feedback && <p role="status" className="text-sm text-marigold">{feedback}</p>}
          </aside>
          <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          <LanternOverlay state={state} placements={placements} onChange={setPlacements} />
          <form onSubmit={submit} className="mt-10 space-y-4">
            <label htmlFor="lantern-word" className="eyebrow">The word in the lantern</label>
            <p className="text-sm text-parchment/60">{ready ? 'The corners meet. What does the lantern say?'
              : 'Unlock every partner card and align its corners before offering the word.'}</p>
            <div className="flex flex-wrap gap-3">
              <input id="lantern-word" className="input-ember min-w-0 flex-1 font-code uppercase"
                value={word} onChange={(e) => setWord(e.target.value)} maxLength={30} autoComplete="off" spellCheck={false} />
              <button type="submit" className="btn-ember" disabled={busy || !ready || !word.trim()}>
                {busy ? 'Listening…' : 'Offer the word'}
              </button>
            </div>
          </form>
          </div>
        </div>}
        {!state && feedback && <p role="status" className="mt-5 text-marigold">{feedback}</p>}
        <div className="mt-10"><HintSection puzzleId={puzzle.id} maxHints={puzzle.maxHints}
          hintsUsed={puzzle.hintsUsed} revealedHints={puzzle.revealedHints}
          onHints={(hints, used) => setPuzzle({ ...puzzle, revealedHints: hints, hintsUsed: used })} /></div>
      </>}
      <div className="mt-20"><FragmentLedger fragments={fragments} /></div>
    </Layout>
  );
}
