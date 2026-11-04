import { useState } from 'react';
import { hanoiPegs, hanoiSolved, MAX_HANOI_MOVES } from '../services/hanoi';

const PEG_NAMES = ['First light', 'The crossing', 'The Vault'];
const DISK_COLOURS = ['#fce5a4', '#eeb84e', '#dc8833', '#bd5428'];

export function HanoiTower({ moves, onChange }: { moves: string; onChange: (moves: string) => void }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [message, setMessage] = useState('Choose a tower to lift its top disk, then choose its destination.');
  const pegs = hanoiPegs(moves);
  const solved = hanoiSolved(moves);
  const moveCount = moves.length / 2;

  function choosePeg(peg: number) {
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
    onChange(next);
    setSelected(null);
    setMessage(hanoiSolved(next)
      ? 'The four flames have crossed. The final word and proof code are now revealed below.'
      : `Disk moved to ${PEG_NAMES[peg]}. Choose the next tower.`);
  }

  return (
    <section className="card border-ember/40" aria-labelledby="hanoi-title">
      <p className="eyebrow">The last crossing · Four disks</p>
      <h2 id="hanoi-title" className="mt-3 text-3xl text-ember-glow">Carry the flame</h2>
      <p className="mt-4 text-sm leading-relaxed text-parchment/75">
        Move all four disks from the first tower to the Vault on the right. Move only one top disk at a time.
        A larger disk can never rest on a smaller one. All legal solutions count; 15 moves is the shortest.
      </p>
      <div className="mt-8 grid grid-cols-3 gap-2 sm:gap-5" role="group" aria-label="Tower of Hanoi">
        {pegs.map((disks, peg) => (
          <button
            key={peg}
            type="button"
            disabled={solved}
            aria-pressed={selected === peg}
            aria-label={`${PEG_NAMES[peg]}. ${disks.length ? `Disks bottom to top: ${disks.join(', ')}.` : 'Empty.'}${selected === peg ? ' Selected.' : ''}`}
            onClick={() => choosePeg(peg)}
            className={`min-w-0 rounded-xl border px-1 pb-4 pt-6 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ember-glow ${selected === peg ? 'border-ember-glow bg-ember/15' : 'border-parchment/15 hover:border-ember/60'}`}
          >
            <div className="relative mx-auto flex h-36 w-full flex-col-reverse items-center gap-1 border-b-4 border-ember/60 pb-1">
              <span aria-hidden="true" className="absolute bottom-0 h-32 w-1 rounded-t bg-parchment/25" />
              {disks.map((disk) => (
                <span
                  key={disk}
                  aria-hidden="true"
                  className={`relative z-10 flex h-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-midnight ${selected === peg && disk === disks.at(-1) ? '-translate-y-2' : ''}`}
                  style={{ width: `${30 + disk * 16}%`, backgroundColor: DISK_COLOURS[disk - 1] }}
                >
                  {disk}
                </span>
              ))}
            </div>
            <span className="mt-4 block text-xs text-parchment/80">{PEG_NAMES[peg]}</span>
          </button>
        ))}
      </div>
      <p role="status" aria-live="polite" className="mt-5 min-h-12 text-sm text-marigold">{message}</p>
      <div className="mt-4 flex items-center justify-between gap-4">
        <p className="text-xs text-parchment/60">{moveCount} moves{solved ? ' · Crossing complete' : ''}</p>
        <button
          type="button"
          disabled={!moves && selected === null}
          className="text-sm text-parchment/70 underline hover:text-ember-glow disabled:opacity-40"
          onClick={() => {
            onChange('');
            setSelected(null);
            setMessage('Tower restarted. Carry all four disks to the Vault on the right.');
          }}
        >
          Restart tower
        </button>
      </div>
    </section>
  );
}
