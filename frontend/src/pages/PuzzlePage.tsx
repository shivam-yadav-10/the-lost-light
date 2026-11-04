import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { ContentBlock } from '../api/types';
import { DiyaLamp } from '../components/DiyaLamp';
import { FragmentCard } from '../components/FragmentCard';
import { HintSection } from '../components/HintSection';
import { LanternCourtyard } from '../components/LanternCourtyard';
import { PuzzleBlocks } from '../components/PuzzleBlocks';
import { SparkBurst } from '../components/SparkBurst';
import { SuccessOverlay } from '../components/SuccessOverlay';
import { usePuzzle } from '../store/usePuzzle';
import { useTeam } from '../store/team';
import { parseHiddenWords } from '../services/hiddenWords';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

export function PuzzlePage() {
  const { id } = useParams();
  const puzzleId = Number(id);
  const { session } = useTeam();
  const { puzzle, setPuzzle, loadError } = usePuzzle(puzzleId);
  const [answer, setAnswer] = useState('');
  const [hiddenWords, setHiddenWords] = useState<string[]>(Array(6).fill(''));
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [riddleAnswers, setRiddleAnswers] = useState<string[] | null>(null);
  useEffect(() => {
    setRiddleAnswers(null);
    setAnswer('');
    setHiddenWords(Array(6).fill(''));
    setFeedback(null);
  }, [puzzleId, session?.teamDocId]);
  const closeCelebration = useCallback(() => setCelebrate(false), []);

  async function submitAnswer(value: string) {
    if (!session || !puzzle || value.trim().length === 0) return;
    if (puzzle.id === 5 && !riddleAnswers) {
      setFeedback({ ok: false, text: 'Solve and check all five day riddles before offering the final word.' });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const result = await api.submit(puzzle.id, session.teamDocId, session.teamId, value.trim(),
        puzzle.id === 5 ? JSON.stringify(riddleAnswers) : undefined);
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

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void submitAnswer(puzzleId === 4 ? hiddenWords.filter((word) => word.trim()).join(', ') : answer);
  }

  if (loadError) {
    return (
        <div role="alert" className="card mt-10 text-center">
          <p className="text-marigold">{loadError}</p>
          <Link to="/dashboard" className="btn-ghost mt-5">
            Back to the fragments
          </Link>
        </div>
    );
  }

  if (!puzzle) {
    return (
      <div role="status" className="flex min-h-[60dvh] flex-col items-center justify-center gap-5">
        <span aria-hidden="true" className="h-8 w-8 animate-spin rounded-full border border-ember/20 border-t-ember-glow" />
        <p className="text-sm text-parchment/50">Approaching the light…</p>
      </div>
    );
  }

  const solved = puzzle.state === 'SOLVED';
  const isWordPuzzle = puzzle.id === 4;
  const enteredWords = new Set(parseHiddenWords(hiddenWords.join(' '))).size;
  const enoughWords = enteredWords >= 4;
  const numeral = ROMAN[puzzle.sortOrder - 1];
  // Visual blocks (rangoli, cipher, table, lamps) get their own column; prose sits with the story.
  const visualBlocks = puzzle.blocks.filter((b) => VISUAL_BLOCKS.has(b.type));
  const proseBlocks = puzzle.blocks.filter((b) => !VISUAL_BLOCKS.has(b.type));
  const hasCourtyard = puzzle.blocks.some((block) => block.type === 'courtyard');
  const hasVisual = visualBlocks.length > 0 || hasCourtyard;
  const columns = hasCourtyard
    ? 'lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)] lg:gap-x-6'
    : visualBlocks.some((b) => b.type === 'street')
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
      {!hasCourtyard && <form onSubmit={onSubmit} className={isWordPuzzle ? 'word-notebook' : 'card space-y-4 !p-6'} noValidate>
        {isWordPuzzle ? <fieldset className="min-w-0">
          <legend className="sr-only">Words you found</legend>
          <div className="word-notebook-heading">
            <span className="word-notebook-seal" aria-hidden="true">
              <svg width="26" height="26" viewBox="0 0 32 32" fill="none">
                <path d="M7 22c3-8 9-14 18-16-1 10-6 17-15 18M6 27l13-13M12 19h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <p className="word-notebook-kicker">A little note to the Keeper</p>
          </div>
          <h2 className="word-notebook-title">What caught your eye?</h2>
          <p id="hidden-words-help" className="word-notebook-intro">
            Some words hide in the smallest details. Gather any four from your picture and leave them here.
            No particular order. Take your time.
          </p>
          <div className="word-notebook-fields">
            {hiddenWords.map((word, index) => <label key={index} className={`word-notebook-field${word.trim() ? ' word-notebook-field-filled' : ''}`}>
              <span className="word-notebook-field-label"><span>Your {['first', 'second', 'third', 'fourth', 'fifth', 'sixth'][index]} find</span>
                <span className="word-notebook-field-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
              </span>
              <input value={word} maxLength={24} autoComplete="off" placeholder={index >= 4 ? 'Found another?' : 'A word you spotted…'}
                spellCheck={false} pattern="[A-Za-z]*" aria-describedby={`hidden-words-help${feedback ? ' answer-feedback' : ''}`}
                onChange={(event) => setHiddenWords((current) => current.map((value, i) => i === index ? event.target.value : value))} />
            </label>)}
          </div>
          <div className="word-notebook-progress">
            <span className="word-notebook-dots" aria-hidden="true">
              {Array.from({ length: 4 }, (_, index) => <span key={index} className={enteredWords > index ? 'is-filled' : ''} />)}
            </span>
            <p role="status">{enoughWords ? 'Ready when you are.' : enteredWords === 0 ? 'Four different words are all you need.' : `${enteredWords} noted. A few more details to discover.`}</p>
          </div>
          <p className="word-notebook-footnote">One word per space. All six spaces are yours, but four correct words are enough.</p>
        </fieldset> : <>
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
        </>}
        {puzzle.id === 5 && !riddleAnswers && <p className="text-sm text-parchment/60">Solve all five day riddles and select "Check five answers" before submitting the final word.</p>}
        <button type="submit" className={isWordPuzzle ? 'word-notebook-submit' : 'btn-ember w-full'} disabled={busy || (isWordPuzzle ? !enoughWords : answer.trim().length === 0) || (puzzle.id === 5 && !riddleAnswers)}>
          {busy ? isWordPuzzle ? 'Passing your note…' : 'Offering…' : isWordPuzzle ? 'Send to the Keeper' : 'Offer answer'}
          {isWordPuzzle && <span aria-hidden="true">→</span>}
        </button>
        {feedback && (
          <p id="answer-feedback" role="status" className={`${isWordPuzzle ? 'mt-4 ' : ''}text-sm ${feedback.ok ? 'text-ember-glow' : 'text-marigold'}`}>
            {feedback.text}
          </p>
        )}
      </form>}
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
    <div className="game-page-enter">
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
          <div className="min-w-0 lg:sticky lg:top-8 lg:col-start-1 lg:row-span-2 lg:row-start-1">
            {hasCourtyard && session && (
              <LanternCourtyard key={`${session.teamDocId}-${puzzle.id}`} teamDocId={session.teamDocId}
                busy={busy} solved={solved} feedback={feedback} onSubmit={submitAnswer} />
            )}
            <PuzzleBlocks key={`${session?.teamDocId}-${puzzle.id}`} blocks={visualBlocks}
              onRiddlesValidated={setRiddleAnswers} disabled={busy || solved} />
          </div>
          <div className="lg:col-start-2 lg:row-start-2">{action}</div>
        </article>
      ) : (
        <article className="mt-8 grid items-start gap-10 animate-rise lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-16">
          {intro}
          <div className="lg:sticky lg:top-8">{action}</div>
        </article>
      )}
    </div>
  );
}

const VISUAL_BLOCKS = new Set<ContentBlock['type']>(['street', 'list', 'riddles']);
