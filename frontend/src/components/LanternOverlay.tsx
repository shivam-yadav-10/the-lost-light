import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { ConvergenceState, OverlayCard, OverlayPlacement } from '../api/types';
import { adjustPlacement, overlayKeyAction } from '../services/convergenceOverlay';

function Pattern({ card }: { card: OverlayCard }) {
  return <>{card.lit.map((pixel) => (
    <rect key={pixel} x={pixel % card.width} y={Math.floor(pixel / card.width)}
      width={1} height={1} fill="#f3b957" />
  ))}</>;
}

function Corners({ colour }: { colour: string }) {
  return <><path d="M0 2V0H2 M29 0H31V2 M31 7V9H29 M2 9H0V7"
    fill="none" stroke={colour} strokeWidth=".18" />
    <circle cx={-.5} cy={-.5} r={.25} fill={colour} /></>;
}

export function LanternOverlay({ state, placements, onChange }: {
  state: ConvergenceState;
  placements: OverlayPlacement[];
  onChange: (placements: OverlayPlacement[]) => void;
}) {
  const [active, setActive] = useState('');
  const drag = useRef<{ id: string; clientX: number; clientY: number; x: number; y: number } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const unlocked = state.partners.filter((partner) => partner.verified && partner.card);

  useEffect(() => {
    const missing = unlocked.filter((partner) => !placements.some((p) => p.teamId === partner.teamId));
    if (missing.length) {
      onChange([...placements, ...missing.map((partner) => {
        const index = state.partners.findIndex((candidate) => candidate.teamId === partner.teamId);
        return {
          teamId: partner.teamId, x: index === 0 ? 3 : -3, y: index === 0 ? 2 : -2,
          rotation: index === 0 ? 90 : 270,
        };
      })]);
    }
    if (!active && unlocked[0]) setActive(unlocked[0].teamId);
  }, [unlocked, placements, onChange, active, state.partners]);

  function update(teamId: string, patch: Partial<OverlayPlacement>) {
    onChange(placements.map((p) => p.teamId === teamId ? adjustPlacement(p, patch) : p));
  }
  const selected = placements.find((p) => p.teamId === active);
  function move(x: number, y: number) {
    if (selected) update(active, { x: selected.x + x, y: selected.y + y });
  }
  function rotate(amount: number) {
    if (selected) update(active, { rotation: selected.rotation + amount });
  }
  function keyDown(event: KeyboardEvent<HTMLElement>) {
    const action = overlayKeyAction(event);
    if (!selected || !action) return;
    event.preventDefault();
    if (action.rotation) rotate(action.rotation);
    else move(action.x, action.y);
  }
  function pointerDown(event: PointerEvent<SVGGElement>, placement: OverlayPlacement) {
    if (!event.isPrimary) return;
    event.preventDefault();
    setActive(placement.teamId);
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: placement.teamId, clientX: event.clientX, clientY: event.clientY, x: placement.x, y: placement.y };
  }
  function pointerMove(event: PointerEvent<SVGGElement>) {
    if (!drag.current || !svg.current) return;
    const matrix = svg.current.getScreenCTM();
    if (!matrix) return;
    const inverse = matrix.inverse();
    const start = new DOMPoint(drag.current.clientX, drag.current.clientY).matrixTransform(inverse);
    const current = new DOMPoint(event.clientX, event.clientY).matrixTransform(inverse);
    update(drag.current.id, {
      x: drag.current.x + current.x - start.x,
      y: drag.current.y + current.y - start.y,
    });
  }
  const ordered = [...unlocked].sort((a, b) => Number(a.teamId === active) - Number(b.teamId === active));
  return (
    <section className="card mt-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ember-glow"
      tabIndex={0} onKeyDown={keyDown} aria-labelledby="overlay-heading" aria-describedby="overlay-instructions">
      <h2 id="overlay-heading" className="text-2xl text-ember-glow">The lantern table</h2>
      <p className="mt-3 text-sm text-parchment/70" id="overlay-instructions">
        Your card is fixed. Select a partner card, drag to slide it and turn it with the buttons.
        Keyboard: focus this workspace, use arrow keys to slide and Ctrl+R to rotate.
        Ctrl+Shift+R rotates the other way. R / Shift+R also work.
        Each move snaps one square. Match all four corner marks and their single orientation dot.
        Read the dark spaces between the gold squares, not the gold itself.
      </p>
      <p className="mt-4 rounded-lg border border-ember/40 bg-ember/10 px-4 py-3 text-sm text-ember-glow">
        Need to turn a card? Select your partner below, then press <kbd>Ctrl + R</kbd> here or use Rotate.
        The shortcut rotates only while this workspace has focus; elsewhere it refreshes the browser.
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        {unlocked.map((partner) => <button key={partner.teamId} type="button"
          className={active === partner.teamId ? 'btn-ember' : 'btn-ghost'}
          aria-pressed={active === partner.teamId} onClick={() => setActive(partner.teamId)}>{partner.name}</button>)}
      </div>
      <svg ref={svg} viewBox="-8 -15 47 39" className="mt-4 w-full rounded-xl bg-midnight"
        aria-label="Overlapping patterned lantern cards, bright squares on a dark table">
        <rect x={0} y={0} width={31} height={9} fill="#13101d" />
        <Pattern card={state.card} />
        <Corners colour="#ffffff" />
        {ordered.map((partner) => {
          const p = placements.find((placement) => placement.teamId === partner.teamId);
          if (!p || !partner.card) return null;
          return <g key={partner.teamId} transform={`translate(${p.x} ${p.y}) rotate(${p.rotation} 15.5 4.5)`}
            tabIndex={0} role="group" aria-label={`${partner.name} movable card`}
            aria-describedby="overlay-instructions" style={{ touchAction: 'none', cursor: 'grab' }}
            onFocus={() => setActive(partner.teamId)}
            onPointerDown={(event) => pointerDown(event, p)} onPointerMove={pointerMove}
            onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
            onLostPointerCapture={() => { drag.current = null; }}>
            <Pattern card={partner.card} />
            <Corners colour={state.partners.indexOf(partner) === 0 ? '#65e5ff' : '#f392ed'} />
            <rect width={31} height={9} fill="transparent" stroke={active === partner.teamId ? '#ffffff' : 'none'}
              strokeWidth=".06" />
          </g>;
        })}
      </svg>
      {selected ? <div className="mt-5 space-y-4">
        <p className="text-sm text-parchment/70">Selected card: horizontal {selected.x}, vertical {selected.y}, turn {selected.rotation}°.</p>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn-ghost" onClick={() => move(-1, 0)} aria-label="Slide left">←</button>
          <button type="button" className="btn-ghost" onClick={() => move(1, 0)} aria-label="Slide right">→</button>
          <button type="button" className="btn-ghost" onClick={() => move(0, -1)} aria-label="Slide up">↑</button>
          <button type="button" className="btn-ghost" onClick={() => move(0, 1)} aria-label="Slide down">↓</button>
          <button type="button" className="btn-ghost" onClick={() => rotate(-90)}>Rotate ↶</button>
          <button type="button" className="btn-ghost" onClick={() => rotate(90)}>Rotate ↷</button>
        </div>
      </div> : <p className="text-sm text-parchment/60">Exchange a partner seal to bring their card to the table.</p>}
    </section>
  );
}
