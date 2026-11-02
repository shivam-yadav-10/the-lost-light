import type { LanternCell } from '../api/types';
import { SymbolShape } from './SymbolShape';
import { WheelGuides, polar } from './wheel';

const SIZE = 560;
const CENTRE = SIZE / 2;
const RADII = [52, 96, 140, 184, 228];

/** The team's Convergence lantern: each cell holds a flame digit (top), shadow digit (bottom) and a mark. */
export function Lantern({ cells }: { cells: LanternCell[] }) {
  return (
    <figure className="mx-auto w-full max-w-[600px]">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-auto w-full" role="img" aria-label="Your team's lantern">
        <circle cx={CENTRE} cy={CENTRE} r={RADII[4] + 26} fill="#12102a" fillOpacity="0.6" />
        <WheelGuides centre={CENTRE} radii={RADII} labelRadius={RADII[4] + 38} />
        <circle cx={CENTRE} cy={CENTRE} r="14" fill="#fde68a" fillOpacity="0.85" />
        {cells.map((c) => {
          const at = polar(c.spoke, RADII[c.ring - 1], CENTRE);
          return (
            <g key={`${c.ring}-${c.spoke}`} transform={`translate(${at.x} ${at.y})`} fontFamily="Manrope Variable, Manrope, system-ui, sans-serif">
              <rect x="-17" y="-17" width="34" height="34" rx="9" fill="#1a1738" stroke="#f59e0b" strokeOpacity="0.25" />
              <text y="-5" textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="700" fill="#fde68a">
                {c.flame}
              </text>
              <line x1="-9" x2="9" y1="1" y2="1" stroke="#f59e0b" strokeOpacity="0.35" />
              <text y="8" textAnchor="middle" dominantBaseline="central" fontSize="12" fill="#a8a2c4">
                {c.shadow}
              </text>
              <SymbolShape name={c.mark} r={4.5} x={13} y={-13} colour="#f97316" />
            </g>
          );
        })}
      </svg>
      <details className="mt-3 text-sm text-parchment/60">
        <summary className="cursor-pointer text-center">Text description of every cell</summary>
        <ul className="mt-3 grid gap-1 sm:grid-cols-2">
          {cells.map((c) => (
            <li key={`${c.ring}-${c.spoke}`}>
              {c.spoke}, {c.ring === 1 ? 'innermost' : c.ring === 5 ? 'outermost' : `circle ${c.ring} from the centre`}: flame{' '}
              {c.flame}, shadow {c.shadow}, mark {c.mark}
            </li>
          ))}
        </ul>
      </details>
    </figure>
  );
}
