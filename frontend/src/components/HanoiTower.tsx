import { useLayoutEffect, useRef, useState } from 'react';
import { HANOI_DISKS, hanoiPegs, hanoiSolved, MAX_HANOI_MOVES } from '../services/hanoi';

const PEG_NAMES = ['First light', 'The crossing', 'The Vault'];
const DISK_COLOURS = ['#fff0b0', '#f9d873', '#eeb84e', '#e89b3c', '#d87a32', '#c35a30', '#a94332'];
const DISKS = Array.from({ length: HANOI_DISKS }, (_, index) => index + 1);

function diskPosition(moves: string, disk: number) {
  const pegs = hanoiPegs(moves);
  const peg = pegs.findIndex((stack) => stack.includes(disk));
  return { x: 150 + peg * 300, y: 330 - pegs[peg].indexOf(disk) * 29 };
}

export function HanoiTower({ moves, onChange }: { moves: string; onChange: (moves: string) => void }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [travelling, setTravelling] = useState(false);
  const [message, setMessage] = useState('Choose a tower to lift its top disk, then choose its destination.');
  const elements = useRef(new Map<number, SVGGElement>());
  const previousMoves = useRef(moves);
  const pegs = hanoiPegs(moves);
  const solved = hanoiSolved(moves);
  const moveCount = moves.length / 2;

  useLayoutEffect(() => {
    const previous = previousMoves.current;
    previousMoves.current = moves;
    if (!moves.startsWith(previous) || moves.length !== previous.length + 2
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setTravelling(false);
      return;
    }
    const from = Number(moves.at(-2));
    const disk = hanoiPegs(previous)[from].at(-1)!;
    const element = elements.current.get(disk);
    if (!element || typeof element.animate !== 'function') {
      setTravelling(false);
      return;
    }
    const start = diskPosition(previous, disk);
    const end = diskPosition(moves, disk);
    const animation = element.animate([
      { transform: `translate(${start.x}px, ${start.y}px)`, offset: 0 },
      { transform: `translate(${start.x}px, 60px)`, offset: .28 },
      { transform: `translate(${end.x}px, 60px)`, offset: .72 },
      { transform: `translate(${end.x}px, ${end.y}px)`, offset: 1 },
    ], { duration: 950, easing: 'ease-in-out' });
    animation.onfinish = () => setTravelling(false);
    return () => animation.cancel();
  }, [moves]);

  function choosePeg(peg: number) {
    if (travelling || solved) return;
    if (selected === null) {
      if (pegs[peg].length === 0) {
        setMessage('That tower is empty. Choose a tower with a disk.');
        return;
      }
      setSelected(peg);
      setMessage(`Top disk on ${PEG_NAMES[peg]} selected. Choose a destination, or select it again to cancel.`);
      return;
    }
    if (selected === peg) {
      setSelected(null);
      setMessage('Selection cancelled. Choose a tower.');
      return;
    }
    if (moveCount >= MAX_HANOI_MOVES) {
      setMessage('The move record is full. Restart the tower to try again.');
      return;
    }
    const next = `${moves}${selected}${peg}`;
    try {
      hanoiPegs(next);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'That move is not allowed.');
      return;
    }
    setTravelling(true);
    onChange(next);
    setSelected(null);
    setMessage(hanoiSolved(next)
      ? 'The seven flames have crossed. The final word and proof code are now revealed below.'
      : `Disk moved to ${PEG_NAMES[peg]}. Choose the next tower.`);
  }

  return (
    <section className={`hanoi-chamber card border-ember/40 ${solved && !travelling ? 'hanoi-complete' : ''}`} aria-labelledby="hanoi-title">
      <p className="eyebrow">The last crossing · Seven disks</p>
      <h2 id="hanoi-title" className="mt-3 text-3xl text-ember-glow">Seven flames. One final crossing.</h2>
      <p className="mt-4 text-sm leading-relaxed text-parchment/75">
        Carry all seven disks from the first tower to the Vault on the right. Choose a tower, then a destination;
        watch its top disk rise and cross. A larger disk can never rest on a smaller one.
        All legal solutions count; 127 moves is the shortest.
      </p>
      <div className="hanoi-board relative mt-8" role="group" aria-label="Tower of Hanoi" aria-busy={travelling}>
        <svg viewBox="0 0 900 410" className="pointer-events-none block w-full" aria-hidden="true">
          {[150, 450, 750].map((x, peg) => <g key={x}>
            <ellipse cx={x} cy="366" rx="119" ry="12" fill="#f59e0b" opacity={selected === peg ? '.16' : '.05'} />
            <rect x={x - 4} y="100" width="8" height="244" rx="4" fill="#d5ab68" opacity=".4" />
            <path d={`M${x - 120} 348H${x + 120}`} stroke="#d5ab68" strokeWidth="8" strokeLinecap="round" />
            <circle cx={x} cy="98" r="7" fill="#fde68a" opacity=".7" />
          </g>)}
          {DISKS.map((disk) => {
            const position = diskPosition(moves, disk);
            const width = 52 + disk * 28;
            const lifted = !travelling && selected !== null && pegs[selected].at(-1) === disk;
            return <g key={disk} ref={(element) => {
              if (element) elements.current.set(disk, element);
              else elements.current.delete(disk);
            }} style={{ transform: `translate(${position.x}px, ${position.y}px)` }}>
              <g className={lifted ? 'hanoi-disk hanoi-disk-selected' : 'hanoi-disk'}>
                <rect x={-width / 2} y="-12" width={width} height="24" rx="12"
                  fill={DISK_COLOURS[disk - 1]} stroke="#fff0b0" strokeOpacity=".3" strokeWidth="1.5" />
                <path d={`M${-width / 2 + 13} -6H${width / 2 - 13}`} stroke="#fff7d6" strokeOpacity=".35" strokeWidth="2" />
                <text textAnchor="middle" dominantBaseline="central" fontSize="13" fontWeight="700" fill="#241713">{disk}</text>
              </g>
            </g>;
          })}
        </svg>
        <div className="absolute inset-0 grid grid-cols-3">
        {pegs.map((disks, peg) => (
          <button
            key={peg}
            type="button"
            disabled={solved || travelling}
            aria-pressed={selected === peg}
            aria-label={`${PEG_NAMES[peg]}. ${disks.length ? `Disks bottom to top: ${disks.join(', ')}.` : 'Empty.'}${selected === peg ? ' Selected.' : ''}`}
            onClick={() => choosePeg(peg)}
            className={`min-w-0 rounded-xl border bg-transparent transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ember-glow ${selected === peg ? 'border-ember-glow/60' : 'border-transparent enabled:hover:border-ember/30'}`}
          >
            <span className="sr-only">{PEG_NAMES[peg]}</span>
          </button>
        ))}
        </div>
      </div>
      <div aria-hidden="true" className="grid grid-cols-3 gap-2 text-center text-xs text-parchment/70">
        {PEG_NAMES.map((name) => <span key={name}>{name}</span>)}
      </div>
      <p role="status" aria-live="polite" className="mt-5 min-h-12 text-sm text-marigold">{message}</p>
      <div className="mt-4 flex items-center justify-between gap-4">
        <p className="text-xs text-parchment/60">{moveCount} moves{solved ? ' · Crossing complete' : ''}</p>
        <button
          type="button"
          disabled={travelling || (!moves && selected === null)}
          className="text-sm text-parchment/70 underline hover:text-ember-glow disabled:opacity-40"
          onClick={() => {
            onChange('');
            setSelected(null);
            setMessage('Tower restarted. Carry all seven disks to the Vault on the right.');
          }}
        >
          Restart tower
        </button>
      </div>
    </section>
  );
}
