import type { SymbolName } from '../api/types';

interface SymbolShapeProps {
  name: SymbolName;
  /** Half-size of the glyph in SVG units. */
  r?: number;
  x?: number;
  y?: number;
  colour?: string;
}

/** Fragment marks drawn as SVG so they render identically on fragment cards and the lantern. */
export function SymbolShape({ name, r = 10, x = 0, y = 0, colour = 'currentColor' }: SymbolShapeProps) {
  const s = r / 10;
  const common = { fill: 'none', stroke: colour, strokeWidth: 1.6 / s, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {name === 'star' && <path d="M0 -10 L2.6 -2.6 L10 0 L2.6 2.6 L0 10 L-2.6 2.6 L-10 0 L-2.6 -2.6 Z" {...common} fill={colour} />}
      {name === 'crescent' && <path d="M3 -9 A9 9 0 1 0 3 9 A7 7 0 1 1 3 -9 Z" {...common} fill={colour} />}
      {name === 'diamond' && <path d="M0 -10 L7 0 L0 10 L-7 0 Z" {...common} />}
      {name === 'ring' && (
        <>
          <circle r="8" {...common} />
          <circle r="2.4" fill={colour} />
        </>
      )}
      {name === 'flame' && <path d="M0 -10 C6 -3 7 4 0 9 C-7 4 -6 -3 0 -10 Z" {...common} fill={colour} />}
      {name === 'spiral' && <path d="M0 0 C0 -2 2 -3 3.5 -1.5 C5.5 0.5 4 5 0 5 C-5 5 -7 0 -5.5 -4 C-3.5 -8.5 4 -9.5 7.5 -5 C10 -1.5 9 5 6 8" {...common} />}
    </g>
  );
}

const LABELS: Record<SymbolName, string> = {
  star: 'Star',
  crescent: 'Crescent',
  diamond: 'Diamond',
  ring: 'Ring',
  flame: 'Flame',
  spiral: 'Spiral',
};

export const symbolLabel = (name: SymbolName) => LABELS[name];

/** Standalone icon with an accessible name. */
export function SymbolIcon({ name, size = 28, className = '' }: { name: SymbolName; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="-12 -12 24 24" role="img" aria-label={LABELS[name]} className={className}>
      <SymbolShape name={name} colour="currentColor" />
    </svg>
  );
}
