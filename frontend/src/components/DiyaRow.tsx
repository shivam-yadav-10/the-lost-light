import { Link } from 'react-router-dom';
import type { FragmentState, PuzzleSummary } from '../api/types';
import { DiyaLamp } from './DiyaLamp';

const STATE_LABEL: Record<FragmentState, string> = {
  LOCKED: 'Unlit',
  AVAILABLE: 'Ready to light',
  SOLVED: 'Burning',
};

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

/** Six diyas resting on a ledge; each one's flame reflects that fragment's progress. */
const LAMP_SIZE = 128;
// The ledge line sits under the bowls: lamp height is size × 150/120, bowl bottom at y≈132 of 150, plus py-2.
const LEDGE_TOP = Math.round(8 + ((LAMP_SIZE * 150) / 120) * (132 / 150));

export function DiyaRow({ puzzles }: { puzzles: PuzzleSummary[] }) {
  return (
    <div className="relative">
      <ol className="relative z-10 grid grid-cols-6 gap-3 max-lg:grid-cols-3 max-lg:gap-y-12" aria-label="The six diyas">
        {puzzles.map((p, i) => (
          <li key={p.id} className="animate-rise" style={{ animationDelay: `${i * 90}ms` }}>
            <Lamp puzzle={p} igniteDelay={400 + i * 260} />
          </li>
        ))}
      </ol>
      {/* ledge the lamps sit on */}
      <div
        aria-hidden="true"
        style={{ top: LEDGE_TOP }}
        className="pointer-events-none absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-ember/30 to-transparent max-lg:hidden"
      />
    </div>
  );
}

function Lamp({ puzzle, igniteDelay }: { puzzle: PuzzleSummary; igniteDelay: number }) {
  const { state } = puzzle;
  const locked = state === 'LOCKED';
  const numeral = ROMAN[puzzle.sortOrder - 1] ?? String(puzzle.sortOrder);
  const label = `Diya ${numeral}${locked ? '' : `: ${puzzle.title}`}, ${STATE_LABEL[state]}`;

  const content = (
    <div className="flex flex-col items-center text-center">
      <DiyaLamp
        state={state}
        size={LAMP_SIZE}
        igniteDelay={igniteDelay}
        className={[
          'transition duration-500',
          locked && 'opacity-80',
          !locked && 'group-hover:-translate-y-1.5 group-hover:drop-shadow-[0_0_24px_rgba(251,191,36,0.35)]',
        ]
          .filter(Boolean)
          .join(' ')}
      />
      <span className="eyebrow mt-4">{numeral}</span>
      <span
        className={[
          'mt-1.5 min-h-[2.5rem] font-display text-base font-medium leading-tight',
          state === 'SOLVED' ? 'text-ember-glow' : locked ? 'text-parchment/35' : 'text-parchment',
        ].join(' ')}
      >
        {locked ? 'Hidden' : puzzle.title}
      </span>
      <span
        className={[
          'mt-1.5 text-[10px] font-semibold uppercase tracking-[0.12em]',
          state === 'SOLVED' ? 'text-ember-glow/80' : locked ? 'text-parchment/30' : 'text-ember',
        ].join(' ')}
      >
        {STATE_LABEL[state]}
      </span>
    </div>
  );

  if (locked) {
    return (
      <div role="img" aria-label={label} className="cursor-default py-2">
        {content}
      </div>
    );
  }
  return (
    <Link to={`/puzzle/${puzzle.id}`} aria-label={label} className="group block rounded-3xl py-2">
      {content}
    </Link>
  );
}
