import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { ConvergenceState, EarnedFragment, ShardRule } from '../api/types';
import { HintSection } from '../components/HintSection';
import { Lantern } from '../components/Lantern';
import { Layout } from '../components/Layout';
import { PuzzleBlocks } from '../components/PuzzleBlocks';
import { SparkBurst } from '../components/SparkBurst';
import { SuccessOverlay } from '../components/SuccessOverlay';
import { useProgress } from '../store/useProgress';
import { usePuzzle } from '../store/usePuzzle';
import { useTeam } from '../store/team';
import { FragmentLedger, SealedChamber } from './EndgamePages';

const SHARD_TYPES: ShardRule['type'][] = ['A', 'B', 'C', 'D'];

export function ConvergencePage() {
  const { progress, error } = useProgress();
  const entry = progress?.puzzles.find((p) => p.kind === 'convergence');

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
        eyebrow="The Convergence"
        title="This chamber is sealed"
        body="Recover all six fragments, and this door will open on its own."
      />
    );
  }
  return <ConvergenceOpen puzzleId={entry.id} fragments={progress.fragments} />;
}

function ConvergenceOpen({ puzzleId, fragments }: { puzzleId: number; fragments: EarnedFragment[] }) {
  const { session } = useTeam();
  const { puzzle, setPuzzle, loadError } = usePuzzle(puzzleId);
  const [state, setState] = useState<ConvergenceState | null>(null);
  const [stateError, setStateError] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const closeCelebration = useCallback(() => setCelebrate(false), []);

  const loadState = useCallback(async () => {
    if (!session) return;
    try {
      setState(await api.convergence(session.teamDocId));
    } catch (err) {
      setStateError(err instanceof ApiError ? err.message : 'The lantern will not light.');
    }
  }, [session]);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  const failure = loadError ?? stateError;
  if (failure) {
    return (
      <Layout>
        <p role="alert" className="card mt-10 text-marigold">
          {failure}
        </p>
      </Layout>
    );
  }
  if (!puzzle || !state) {
    return (
      <Layout>
        <p className="mt-16 text-center text-parchment/50">The shards are gathering…</p>
      </Layout>
    );
  }

  const solved = puzzle.state === 'SOLVED';
  return (
    <Layout>
      {celebrate && (
        <SuccessOverlay
          eyebrow="The Seventh Shard"
          title="The shards lock together!"
          subtitle="Your key is now your proof. The Vault awaits."
          onClose={closeCelebration}
        />
      )}
      <Link to="/dashboard" className="text-xs text-parchment/60 hover:text-ember-glow">
        ← All fragments
      </Link>
      <header className="mt-10 max-w-3xl animate-rise">
        <p className="eyebrow">VII · {puzzle.fragmentName}</p>
        <h1 className="mt-4 text-5xl text-ember-glow lg:text-6xl">{puzzle.title}</h1>
        <p className="mt-6 text-lg font-light leading-relaxed text-parchment/70 lg:text-xl">{puzzle.intro}</p>
        <div className="mt-8">
          <PuzzleBlocks blocks={puzzle.blocks} />
        </div>
      </header>

      <div className="mt-16 grid grid-cols-[minmax(0,1fr)_minmax(0,26rem)] items-start gap-12 max-lg:grid-cols-1">
        <section aria-labelledby="lantern-heading">
          <h2 id="lantern-heading" className="eyebrow mb-6">
            Your lantern
          </h2>
          <Lantern cells={state.lantern} />
        </section>

        <div className="space-y-8">
          <OwnShard shard={state.shard} />
          <ShardSlots verified={state.verified} />
          {!solved && <SealForm onVerified={() => void loadState()} />}
        </div>
      </div>

      <div className="mt-16 max-w-3xl">
        {solved ? (
          <div className="card relative border-ember/60 text-center shadow-ember animate-rise">
            <p className="text-xl text-ember-glow">{puzzle.completionMessage}</p>
            <Link to="/vault" className="btn-ember mt-8">
              Approach the Vault
            </Link>
          </div>
        ) : (
          <div className="space-y-8">
            <KeyForm
              puzzleId={puzzle.id}
              onSolved={(message, solvedAt) => {
                setCelebrate(true);
                setPuzzle({ ...puzzle, state: 'SOLVED', solvedAt, completionMessage: message });
              }}
            />
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

function OwnShard({ shard }: { shard: ConvergenceState['shard'] }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(shard.seal);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  return (
    <section className="card border-ember/50 shadow-ember" aria-labelledby="own-shard">
      <p className="eyebrow">Your shard</p>
      <h2 id="own-shard" className="mt-3 text-2xl text-ember-glow">
        {shard.type} · {shard.name}
      </h2>
      <p className="mt-4 font-light text-parchment/85">{shard.text}</p>
      <div className="mt-6 rounded-2xl border border-ember/25 bg-midnight-700/60 px-5 py-4">
        <p className="text-xs uppercase tracking-[0.2em] text-parchment/50">Your seal: share it with other teams</p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <code className="font-code text-lg tracking-[0.15em] text-ember-glow">{shard.seal}</code>
          <button type="button" className="btn-ghost !px-4 !py-1.5 text-xs" onClick={() => void copy()}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
    </section>
  );
}

function ShardSlots({ verified }: { verified: ShardRule[] }) {
  return (
    <section aria-labelledby="shards-heading">
      <h2 id="shards-heading" className="eyebrow mb-4">
        Sealed rules ({verified.length} / 4)
      </h2>
      <ul className="space-y-3">
        {SHARD_TYPES.map((type) => {
          const rule = verified.find((v) => v.type === type);
          return (
            <li
              key={type}
              className={`rounded-2xl border px-5 py-4 ${rule ? 'border-ember/40 bg-ember/5' : 'border-white/10 text-parchment/40'}`}
            >
              <p className="text-sm font-medium">
                Shard {type}
                {rule ? ` · ${rule.name}` : ''}
              </p>
              <p className="mt-1 text-sm font-light">{rule ? rule.text : 'Another team holds this shard.'}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SealForm({ onVerified }: { onVerified: () => void }) {
  const { session } = useTeam();
  const [seal, setSeal] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!session || seal.trim().length === 0) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await api.verifySeal(session.teamDocId, seal.trim());
      setMessage({
        ok: true,
        text: result.alreadyHeld ? `You already hold shard ${result.shard.type}.` : `Shard ${result.shard.type} is true.`,
      });
      setSeal('');
      onVerified();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof ApiError ? err.message : 'Something went wrong.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card !p-6" noValidate>
      <label htmlFor="seal" className="eyebrow block">
        Test another team's seal
      </label>
      <div className="mt-4 flex gap-3 max-sm:flex-col">
        <input
          id="seal"
          className="input-ember flex-1 font-code uppercase tracking-[0.15em]"
          value={seal}
          onChange={(e) => setSeal(e.target.value)}
          maxLength={40}
          autoComplete="off"
          spellCheck={false}
          placeholder="SEAL-XXXX-XXXX"
        />
        <button type="submit" className="btn-ember shrink-0 !px-6" disabled={busy || seal.trim().length === 0}>
          {busy ? 'Testing…' : 'Test'}
        </button>
      </div>
      {message && (
        <p role="status" className={`mt-3 text-sm ${message.ok ? 'text-ember-glow' : 'text-marigold'}`}>
          {message.text}
        </p>
      )}
    </form>
  );
}

function KeyForm({ puzzleId, onSolved }: { puzzleId: number; onSolved: (message: string, solvedAt: string | null) => void }) {
  const { session } = useTeam();
  const [key, setKey] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [burst, setBurst] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!session || key.trim().length === 0) return;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await api.submit(puzzleId, session.teamDocId, session.teamId, key.trim());
      if (result.correct) {
        setBurst(true);
        onSolved(result.message, result.puzzle.solvedAt);
      } else {
        setFeedback(result.message);
      }
    } catch (err) {
      setFeedback(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="relative space-y-4" noValidate>
      {burst && <SparkBurst />}
      <label htmlFor="lantern-key" className="eyebrow block">
        Your key
      </label>
      <div className="flex gap-3 max-sm:flex-col">
        <input
          id="lantern-key"
          className="input-ember flex-1 font-code text-lg tracking-[0.3em]"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          inputMode="numeric"
          maxLength={20}
          autoComplete="off"
          placeholder="••••••"
        />
        <button type="submit" className="btn-ember shrink-0" disabled={busy || key.trim().length === 0}>
          {busy ? 'Lighting…' : 'Light the lantern'}
        </button>
      </div>
      {feedback && (
        <p role="status" className="text-sm text-marigold">
          {feedback}
        </p>
      )}
    </form>
  );
}
