import { useCallback, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { ContentBlock } from '../api/types';
import { DiyaLamp } from '../components/DiyaLamp';
import { FragmentCard } from '../components/FragmentCard';
import { HintSection } from '../components/HintSection';
import { Layout } from '../components/Layout';
import { PuzzleBlocks } from '../components/PuzzleBlocks';
import { SparkBurst } from '../components/SparkBurst';
import { SuccessOverlay } from '../components/SuccessOverlay';
import { usePuzzle } from '../store/usePuzzle';
import { useTeam } from '../store/team';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

export function PuzzlePage() {
  const { id } = useParams();
  const puzzleId = Number(id);
  const { session } = useTeam();
  const { puzzle, setPuzzle, loadError } = usePuzzle(puzzleId);
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const closeCelebration = useCallback(() => setCelebrate(false), []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!session || !puzzle || answer.trim().length === 0) return;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await api.submit(session.gameKey, puzzle.id, answer.trim());
      setFeedback({ ok: result.correct, text: result.message });
      if (result.correct) {
        setCelebrate(true);
        setPuzzle({
          ...puzzle,
          state: 'SOLVED',
          solvedAt: result.puzzle.solvedAt,
          fragment: result.fragment,
          completionMessage: result.message,
        });
      }
    } catch (err) {
      setFeedback({ ok: false, text: err instanceof ApiError ? err.message : 'Something went wrong.' });
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <Layout>
        <div role="alert" className="card mt-10 text-center">
          <p className="text-marigold">{loadError}</p>
          <Link to="/dashboard" className="btn-ghost mt-5">
            Back to the fragments
          </Link>
        </div>
      </Layout>
    );
  }

  if (!puzzle) {
    return (
      <Layout>
        <p className="mt-16 text-center text-parchment/50">Approaching the light…</p>
      </Layout>
    );
  }

  const solved = puzzle.state === 'SOLVED';
  const numeral = ROMAN[puzzle.sortOrder - 1];
  // Visual blocks (rangoli, cipher, table, lamps) get their own column; prose sits with the story.
  const visualBlocks = puzzle.blocks.filter((b) => VISUAL_BLOCKS.has(b.type));
  const proseBlocks = puzzle.blocks.filter((b) => !VISUAL_BLOCKS.has(b.type));
  const hasVisual = visualBlocks.length > 0;
  // The street scene is a hidden-object picture, so it gets 70% of the width; other visuals split ~55/45.
  const columns = visualBlocks.some((b) => b.type === 'street')
    ? 'lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)] lg:gap-x-10'
    : 'lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-x-16';

  const intro = (
    <header>
      <p className="eyebrow">
        {numeral} · {puzzle.fragmentName}
      </p>
      <h1 className="mt-3 text-4xl text-ember-glow lg:text-5xl">{puzzle.title}</h1>
      <p className="mt-5 text-lg font-light leading-relaxed text-parchment/70">{puzzle.intro}</p>
      {proseBlocks.length > 0 && (
        <div className="mt-8">
          <PuzzleBlocks blocks={proseBlocks} />
        </div>
      )}
    </header>
  );

  const action = solved ? (
    <div className="space-y-6 animate-rise">
      <div className="card flex flex-col items-center border-ember/60 text-center shadow-ember">
        <div className="relative">
          <DiyaLamp state="SOLVED" size={96} igniteDelay={150} />
          {feedback?.ok && <SparkBurst radius={100} />}
        </div>
        <p className="mt-4 text-lg text-ember-glow">{puzzle.completionMessage}</p>
      </div>
      {puzzle.fragment && <FragmentCard fragment={puzzle.fragment} numeral={numeral} title={puzzle.fragmentName} compact />}
      <Link to="/dashboard" className="btn-ghost w-full">
        Return to the fragments
      </Link>
    </div>
  ) : (
    <div className="space-y-8">
      <form onSubmit={onSubmit} className="card space-y-4 !p-6" noValidate>
        <label htmlFor="answer" className="eyebrow block">
          Your answer
        </label>
        <input
          id="answer"
          className="input-ember"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          maxLength={200}
          autoComplete="off"
          placeholder="Type your answer"
          aria-describedby={feedback ? 'answer-feedback' : undefined}
        />
        <button type="submit" className="btn-ember w-full" disabled={busy || answer.trim().length === 0}>
          {busy ? 'Offering…' : 'Offer answer'}
        </button>
        {feedback && (
          <p id="answer-feedback" role="status" className={`text-sm ${feedback.ok ? 'text-ember-glow' : 'text-marigold'}`}>
            {feedback.text}
          </p>
        )}
      </form>
      <HintSection
        puzzleId={puzzle.id}
        maxHints={puzzle.maxHints}
        hintsUsed={puzzle.hintsUsed}
        revealedHints={puzzle.revealedHints}
        onHints={(hints, used) => setPuzzle({ ...puzzle, revealedHints: hints, hintsUsed: used })}
      />
    </div>
  );

  return (
    <Layout>
      {celebrate && (
        <SuccessOverlay
          eyebrow={`Fragment ${numeral} recovered`}
          title="The light returns!"
          subtitle={puzzle.fragmentName}
          onClose={closeCelebration}
        />
      )}
      <Link to="/dashboard" className="text-xs text-parchment/60 hover:text-ember-glow">
        ← All fragments
      </Link>

      {hasVisual ? (
        // Desktop: puzzle visual on the left (stays in view), story + answer on the right.
        // Mobile: story, then visual, then answer.
        <article className={`mt-8 grid items-start gap-10 animate-rise lg:gap-y-10 ${columns}`}>
          <div className="lg:col-start-2 lg:row-start-1">{intro}</div>
          <div className="lg:sticky lg:top-8 lg:col-start-1 lg:row-span-2 lg:row-start-1">
            <PuzzleBlocks blocks={visualBlocks} />
          </div>
          <div className="lg:col-start-2 lg:row-start-2">{action}</div>
        </article>
      ) : (
        <article className="mt-8 grid items-start gap-10 animate-rise lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-16">
          {intro}
          <div className="lg:sticky lg:top-8">{action}</div>
        </article>
      )}
    </Layout>
  );
}

const VISUAL_BLOCKS = new Set<ContentBlock['type']>(['street', 'list', 'riddles']);
