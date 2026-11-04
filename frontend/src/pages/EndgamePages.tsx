import { Link } from 'react-router-dom';
import type { EarnedFragment } from '../api/types';
import { DiyaLamp } from '../components/DiyaLamp';
import { FragmentCard } from '../components/FragmentCard';
import { Layout } from '../components/Layout';
import { SparkBurst } from '../components/SparkBurst';
import { useProgress } from '../store/useProgress';
import { formatDuration } from '../services/gameRules';

interface SealedProps {
  eyebrow: string;
  title: string;
  body: string;
}

/** Shown while an endgame chamber is locked. Deliberately says nothing about how it works. */
export function SealedChamber({ eyebrow, title, body }: SealedProps) {
  return (
    <Layout>
      <Link to="/dashboard" className="text-xs text-parchment/60 hover:text-ember-glow">
        ← All fragments
      </Link>
      <section className="mt-24 flex flex-col items-center text-center animate-rise">
        <DiyaLamp state="LOCKED" size={110} className="opacity-80" />
        <p className="eyebrow mt-10">{eyebrow}</p>
        <h1 className="mt-4 text-5xl text-ember-glow lg:text-6xl">{title}</h1>
        <p className="mt-8 max-w-xl text-lg font-light leading-relaxed text-parchment/65">{body}</p>
        <p className="mt-12 rounded-full border border-ember/20 px-5 py-2 text-xs uppercase tracking-[0.25em] text-parchment/50">
          Sealed
        </p>
      </section>
    </Layout>
  );
}

/** The team's earned fragment cards, for reference while working on the endgame. */
export function FragmentLedger({ fragments, heading = 'What you carry' }: { fragments: EarnedFragment[]; heading?: string }) {
  if (fragments.length === 0) return null;
  return (
    <section aria-labelledby="ledger-heading">
      <h2 id="ledger-heading" className="eyebrow mb-6">
        {heading}
      </h2>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {fragments.map((f) => (
          <li key={f.puzzleId}>
            <FragmentCard fragment={f} numeral={f.numeral} title={f.title} compact />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CompletionPage() {
  const { progress } = useProgress();
  return (
    <Layout>
      <section className="mt-24 flex flex-col items-center text-center animate-rise">
        <div className="relative">
          <DiyaLamp state="SOLVED" size={170} igniteDelay={300} className="drop-shadow-[0_0_48px_rgba(251,191,36,0.6)]" />
          <SparkBurst loop count={22} radius={150} />
        </div>
        <p className="eyebrow mt-12">The light is whole</p>
        <h1 className="text-shimmer mt-4 text-6xl lg:text-8xl">Shubh Deepavali</h1>
        <p className="mt-10 max-w-xl text-lg font-light leading-relaxed text-parchment/70 lg:text-xl">
          The colours meet, and the light turns white again. It was never one flame. It was every flame, carried by
          every team.
        </p>
        <p className="mt-6 max-w-xl text-2xl font-medium text-ember-glow">
          The Light was never meant to be found alone.
        </p>
        {progress?.gameComplete && (
          <p className="mt-6 text-sm text-parchment/60">
            Adjusted time: <span className="text-ember-glow">{formatDuration(progress.adjustedElapsedMs)}</span>
            {' · '}includes {progress.penaltyMinutes} minutes of hint penalties
          </p>
        )}
        <Link to="/dashboard" className="btn-ghost mt-14">
          Back to the fragments
        </Link>
      </section>
    </Layout>
  );
}
