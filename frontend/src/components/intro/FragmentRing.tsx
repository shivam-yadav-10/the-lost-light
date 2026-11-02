import type { CSSProperties } from 'react';
import type { SymbolName } from '../../api/types';
import { SymbolIcon } from '../SymbolShape';

export type FragmentState = 'dark' | 'ghost' | 'flicker' | 'lit' | 'mystery' | 'hidden';

interface FragmentRingProps {
  /** One state per position; a 7th entry is rendered as the unexplained "?" slot. */
  states: FragmentState[];
  radius?: number;
  size?: number;
  layout?: 'ring' | 'row';
  /** A faint rangoli drawn behind the ring, for the "empty centre" beat. */
  rangoli?: boolean;
  className?: string;
}

// Same six marks used on the dashboard fragments — seeing them here first quietly foreshadows it.
const SYMBOLS: SymbolName[] = ['star', 'crescent', 'diamond', 'ring', 'flame', 'spiral'];

const STATE_CLASS: Record<FragmentState, string> = {
  dark: 'opacity-20',
  ghost: 'opacity-35',
  flicker: 'intro-flicker opacity-90',
  lit: 'opacity-100',
  mystery: 'opacity-70',
  hidden: 'opacity-0',
};

export function FragmentRing({ states, radius = 150, size = 26, layout = 'ring', rangoli = false, className = '' }: FragmentRingProps) {
  const count = states.length;

  // The row layout sits in normal document flow (it's a beat alongside the narration text,
  // not an overlay around a central flame), so it never overlaps the line below it.
  if (layout === 'row') {
    return (
      <div aria-hidden="true" className={`pointer-events-none flex items-center justify-center gap-4 ${className}`}>
        {states.map((state, i) => (
          <div key={i} className={`transition-opacity duration-700 ${STATE_CLASS[state]}`}>
            <FragmentGlyph index={i} state={state} size={size} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-0 flex items-center justify-center ${className}`}>
      {rangoli && <RangoliBackdrop />}
      {states.map((state, i) => {
        const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
        const style: CSSProperties = {
          left: `calc(50% + ${Math.cos(angle) * radius}px)`,
          top: `calc(50% + ${Math.sin(angle) * radius}px)`,
          transform: 'translate(-50%, -50%)',
        };
        return (
          <div key={i} className={`absolute transition-opacity duration-700 ${STATE_CLASS[state]}`} style={style}>
            <FragmentGlyph index={i} state={state} size={size} />
          </div>
        );
      })}
    </div>
  );
}

function FragmentGlyph({ index, state, size }: { index: number; state: FragmentState; size: number }) {
  if (index >= SYMBOLS.length) {
    return (
      <div
        className="flex items-center justify-center rounded-full border border-ember-glow/50 font-display text-ember-glow/80"
        style={{ width: size, height: size, fontSize: size * 0.5 }}
      >
        ?
      </div>
    );
  }
  return <SymbolIcon name={SYMBOLS[index]} size={size} className={state === 'lit' ? 'text-ember-glow story-icon-glow' : 'text-ember/70'} />;
}

const RANGOLI_PETALS = Array.from({ length: 8 }, (_, i) => i * 45);
const RANGOLI_DOTS = Array.from({ length: 16 }, (_, i) => (i * 360) / 16);

/** Faint rangoli lines drawing themselves, left empty at the centre where the light should be,
 * then settling into a slow, subtle glowing turn — alive, not static decoration. */
function RangoliBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 h-[min(70vh,560px)] w-[min(70vh,560px)] -translate-x-1/2 -translate-y-1/2">
      <div className="intro-rangoli-aura absolute inset-0 rounded-full" />
      <svg
        viewBox="-300 -300 600 600"
        className="intro-rangoli-spin relative h-full w-full"
        fill="none"
        stroke="#f59e0b"
        strokeOpacity="0.26"
        strokeWidth="1.4"
      >
        <circle r="90" pathLength={1} className="story-draw" />
        <circle r="160" pathLength={1} className="story-draw" style={{ animationDelay: '400ms' }} />
        <circle r="250" pathLength={1} className="story-draw" style={{ animationDelay: '800ms' }} strokeOpacity="0.14" />
        {RANGOLI_PETALS.map((deg, i) => (
          <path
            key={deg}
            d="M0 -95 C40 -120 40 -150 0 -155 C-40 -150 -40 -120 0 -95 Z"
            transform={`rotate(${deg})`}
            pathLength={1}
            className="story-draw"
            style={{ animationDelay: `${600 + i * 120}ms` }}
          />
        ))}
        {RANGOLI_DOTS.map((deg, i) => (
          <g key={deg} transform={`rotate(${deg})`} className="story-dot" style={{ animationDelay: `${1400 + i * 70}ms` }}>
            <circle
              r="4"
              cy="-205"
              fill="#f59e0b"
              fillOpacity="0.28"
              stroke="none"
              className="intro-rangoli-twinkle"
              style={{ animationDelay: `${i * 0.3}s` }}
            />
          </g>
        ))}
      </svg>
    </div>
  );
}
