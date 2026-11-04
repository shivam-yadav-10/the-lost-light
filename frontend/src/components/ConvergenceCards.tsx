import type { ConvergenceState } from '../api/types';

const CLUES = [
  { title: 'A borrowed flame', text: 'I begin with a spark.', detail: 'A wooden stem wakes against a rough strip.' },
  { title: 'Two of a kind', text: 'I am found when two belong together.', detail: 'Two tiles share the same pattern, line for line.' },
  { title: 'Across the field', text: 'Between rivals, I become a contest.', detail: 'Two sides meet on one field beneath the lights.' },
];

function Illustration({ index }: { index: number }) {
  return <svg viewBox="0 0 300 220" className="mx-auto w-full max-w-sm" aria-hidden="true">
    <circle cx="150" cy="106" r="85" fill="#f59e0b" opacity=".06" />
    {index === 0 ? <>
      <path d="M92 180 170 92" stroke="#cfaa73" strokeWidth="13" strokeLinecap="round" />
      <path d="M170 100C130 80 166 48 170 24c10 28 48 48 25 72-7 9-16 12-25 4Z" fill="#f59e0b" />
      <path d="M173 94c-10-12 3-24 5-35 15 18 20 29 8 37Z" fill="#fde68a" />
      <path d="m184 143 45 21-17 37-45-21Z" fill="#783d26" stroke="#d4aa6b" strokeWidth="2" />
      <path d="m183 159 32 15m-36-6 32 15" stroke="#f5e6c8" opacity=".5" strokeWidth="2" />
    </> : index === 1 ? <>
      {[55, 165].map((x) => <g key={x} transform={`translate(${x} 60)`}>
        <rect width="80" height="106" rx="8" fill="#1a1738" stroke="#eeb84e" strokeWidth="2" />
        <path d="M40 17 64 53 40 89 16 53Z" fill="none" stroke="#eeb84e" strokeWidth="2" />
        <circle cx="40" cy="53" r="12" fill="#f59e0b" opacity=".8" />
        <path d="M8 8h12M60 98h12" stroke="#fde68a" strokeWidth="2" />
      </g>)}
    </> : <>
      <path d="m50 92 100-42 100 42v92l-100 28-100-28Z" fill="#183c35" stroke="#d4aa6b" strokeWidth="2" />
      <path d="M50 137h200M150 50v162" stroke="#f5e6c8" opacity=".6" strokeWidth="2" />
      <ellipse cx="150" cy="135" rx="26" ry="17" fill="none" stroke="#f5e6c8" opacity=".6" />
      {[90, 112, 200, 220].map((x, i) => <g key={x}>
        <circle cx={x} cy={105 + (i % 2) * 55} r="6" fill={i < 2 ? '#fbbf24' : '#a5d9e8'} />
        <path d={`M${x} ${113 + (i % 2) * 55}v12`} stroke={i < 2 ? '#fbbf24' : '#a5d9e8'} strokeWidth="8" strokeLinecap="round" />
      </g>)}
    </>}
  </svg>;
}

export function ConvergenceCards({ state }: { state: ConvergenceState }) {
  const cards = [
    { teamId: state.ownId, name: 'Your card', clueIndex: state.clueIndex, verified: true },
    ...state.partners,
  ];
  return <section className="mt-10" aria-label="Your circle's illustrated clues">
    <p className="eyebrow">One word, different stories</p>
    <p className="mt-3 max-w-2xl text-parchment/70">
      Each picture tells a different story. Find one five-letter word that fits every revealed clue.
      Nothing needs moving or rotating.
    </p>
    <div className={`mt-6 grid gap-5 ${cards.length === 2 ? 'xl:grid-cols-2' : 'xl:grid-cols-3'}`}>
      {cards.map((card) => {
        const clue = card.clueIndex === null ? null : CLUES[card.clueIndex];
        return <article key={card.teamId} className="overflow-hidden rounded-2xl border border-ember/30 bg-midnight-800 p-5 text-center">
          <p className="text-xs uppercase tracking-widest text-parchment/60">{card.name}</p>
          {card.verified && clue && card.clueIndex !== null ? <>
            <Illustration index={card.clueIndex} />
            <h2 className="text-xl text-ember-glow">{clue.title}</h2>
            <p className="mt-4 text-lg text-parchment">{clue.text}</p>
            <p className="mt-3 text-sm leading-relaxed text-parchment/50">{clue.detail}</p>
          </> : <div className="flex min-h-80 flex-col items-center justify-center">
            <span aria-hidden="true" className="text-5xl text-ember/50">?</span>
            <h2 className="mt-6 text-xl text-ember-glow">A story still sealed</h2>
            <p className="mt-4 text-sm leading-relaxed text-parchment/60">Meet this team in Convergence and enter their seal to reveal their illustration and clue.</p>
          </div>}
        </article>;
      })}
    </div>
  </section>;
}
