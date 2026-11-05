import type { FragmentMeta } from '../api/types';
import { SymbolIcon, symbolLabel } from './SymbolShape';
import { useProgress } from '../store/useProgress';

// Swatches for the colour names a fragment can carry. Unknown names fall back to amber.
const SWATCH: Record<string, string> = {
  Red: '#ef4444',
  Orange: '#f97316',
  Yellow: '#facc15',
  Green: '#22c55e',
  Blue: '#3b82f6',
  Violet: '#8b5cf6',
  Gold: '#d4a017',
};

interface FragmentCardProps {
  fragment: FragmentMeta;
  numeral?: string;
  title?: string;
  compact?: boolean;
}

/** The fragment details awarded on solve. Presented as an ornament; every value is also written out. */
export function FragmentCard({ fragment, numeral, title, compact = false }: FragmentCardProps) {
  const { progress } = useProgress();
  const convergenceSolved = progress?.puzzles.some((puzzle) => puzzle.kind === 'convergence' && puzzle.state === 'SOLVED');
  const colour = convergenceSolved && fragment.colour === 'Gold' ? 'Green' : fragment.colour;
  const swatch = SWATCH[colour] ?? '#f59e0b';
  const rows: [string, string][] = [
    ['Symbol', symbolLabel(fragment.symbol)],
    ['Number', String(fragment.number)],
    ['Direction', fragment.direction],
    ['Keyword', fragment.keyword],
    ['Colour', colour],
  ];
  return (
    <article
      className={`relative overflow-hidden rounded-3xl border bg-midnight-800/70 ${compact ? 'p-5' : 'p-7'}`}
      style={{ borderColor: `${swatch}66`, boxShadow: `0 0 32px ${swatch}22` }}
    >
      <div aria-hidden="true" className="absolute -right-10 -top-10 h-32 w-32 rounded-full blur-2xl" style={{ background: `${swatch}33` }} />
      <header className="relative flex items-center gap-4">
        <span style={{ color: swatch }}>
          <SymbolIcon name={fragment.symbol} size={compact ? 30 : 38} />
        </span>
        <div>
          {numeral && <p className="eyebrow">Fragment {numeral}</p>}
          {title && <h3 className={`${compact ? 'text-lg' : 'text-2xl'} text-parchment`}>{title}</h3>}
        </div>
      </header>
      <dl className={`relative grid grid-cols-[auto_1fr] gap-x-5 ${compact ? 'mt-4 gap-y-1 text-sm' : 'mt-6 gap-y-2'}`}>
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-xs uppercase tracking-[0.2em] text-parchment/50">{label}</dt>
            <dd className="flex items-center gap-2 font-medium tracking-wide text-ember-glow">
              {label === 'Colour' && (
                <span aria-hidden="true" className="inline-block h-3 w-3 rounded-full" style={{ background: swatch }} />
              )}
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </article>
  );
}
