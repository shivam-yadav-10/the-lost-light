import type { ConvergenceState } from '../api/types';

const LINE_ART: Record<string, string> = {
  balance: 'M150 40V180M90 180H210M65 70H235M80 70 50 130H110ZM220 70 190 130H250Z',
  fish: 'M65 110Q130 30 220 110Q130 190 65 110L35 75V145ZM95 90q20 20 0 40m25-50q25 30 0 60m30-65q25 35 0 70m30-60q20 25 0 50',
  notes: 'M70 150V70L120 55V135M155 120V45L210 30V105M70 70 120 55M155 45 210 30',
  lantern: 'M120 45H180L200 75V160L180 180H120L100 160V75ZM120 45Q150 5 180 45M100 75H200M100 160H200M150 80V155M140 190H160',
  feather: 'M80 180 205 35Q95 25 75 110Q60 140 80 180ZM80 180Q210 150 205 35M110 140V90M140 105V60M110 140H160',
  candle: 'M120 110H180V185H120ZM150 105V90M150 85C115 65 155 45 150 25C195 70 175 90 150 85ZM190 70 230 45M205 40Q210 10 225 30Q240 45 225 50',
  timepiece: 'M125 60V20H175V60M125 160V200H175V160M150 110V80M150 110 175 125M110 70H190V150H110Z',
  eye: 'M45 110Q150 10 255 110Q150 210 45 110ZM220 55 245 30M80 55 55 30M260 110H285M15 110H40',
  gate: 'M80 190V60H220V190M100 190V80H200V190M150 80V190M100 130H200M80 60 150 25 220 60M120 90V185M180 90V185',
  bird: 'M90 160Q80 125 145 120L170 70Q155 40 180 40L220 52 183 55 188 85 165 145 115 155M120 155V190M145 150V190M100 132 55 110 85 145',
  hoist: 'M100 190V35H130V190M70 190H160M100 35H245L130 55H55L100 35M215 40V130M205 130V145H225V130M95 185 135 145 95 110 135 75 95 40',
  neck: 'M85 190V140Q85 120 110 120H135V75Q110 70 120 45Q130 20 150 35L160 55 190 65 160 75V135Q160 155 185 165L210 190',
  pencil: 'M65 165 180 50 215 85 100 200 65 200ZM180 50 195 35 230 70 215 85M65 165 100 200M80 180 197 68M65 200 80 196',
  score: 'M65 55H235V165H65ZM150 55V165M90 80H120V140H90ZM180 80H205V140H180ZM100 185H200M150 165V185M250 45V85M230 65H270',
  arrow: 'M55 150H165V185L245 110 165 35V70H55ZM80 185H130',
};

function Illustration({ art }: { art: string }) {
  const index = ['spark', 'tiles', 'field'].indexOf(art);
  if (index === -1) {
    const path = LINE_ART[art];
    if (!path) throw new Error('An illustrated clue is missing its artwork. Ask a Keeper to update Convergence.');
    return <svg viewBox="0 0 300 220" className="mx-auto w-full max-w-sm" aria-hidden="true">
      <circle cx="150" cy="106" r="85" fill="#f59e0b" opacity=".06" />
      <path d={path} fill="none" stroke="#eeb84e" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      {art === 'eye' && <circle cx="150" cy="110" r="25" fill="#f59e0b" />}
      {art === 'fish' && <circle cx="190" cy="100" r="5" fill="#fde68a" />}
      {art === 'notes' && [70, 120, 155, 210].map((x, i) => <ellipse key={x} cx={x - 8} cy={[150, 135, 120, 105][i]} rx="12" ry="8" fill="#eeb84e" />)}
    </svg>;
  }
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
    { teamId: state.ownId, name: 'Your card', clue: state.clue, verified: true },
    ...state.partners,
  ];
  return <section className="mt-10" aria-label="Your circle's illustrated clues">
    <p className="eyebrow">One word, different stories</p>
    <p className="mt-3 max-w-2xl text-parchment/70">
      Each picture tells a different story. Find one five-letter word that fits every revealed clue.
      These pictures do not move. The separate lantern table below holds your second word.
    </p>
    <div className={`mt-6 grid gap-5 ${cards.length === 2 ? 'xl:grid-cols-2' : 'xl:grid-cols-3'}`}>
      {cards.map((card) => {
        const clue = card.clue;
        return <article key={card.teamId} className="overflow-hidden rounded-2xl border border-ember/30 bg-midnight-800 p-5 text-center">
          <p className="text-xs uppercase tracking-widest text-parchment/60">{card.name}</p>
          {card.verified && clue ? <>
            <Illustration art={clue.art} />
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
