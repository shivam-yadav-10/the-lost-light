import type { CSSProperties } from 'react';

const LANTERNS = Array.from({ length: 14 }, (_, index) => ({
  left: `${4 + (index * 37) % 92}%`,
  top: `${8 + (index * 23) % 78}%`,
  '--drift': `${18 + index % 5 * 4}s`,
  '--delay': `${-index * 3}s`,
  '--size': `${14 + index % 4 * 5}px`,
}));

export function FloatingLanterns() {
  return <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
    {LANTERNS.map((style, index) => <div key={index} className="waiting-lantern" style={style as CSSProperties}>
      <span className="waiting-lantern-paper" />
      <span className="waiting-lantern-flame" />
    </div>)}
  </div>;
}
