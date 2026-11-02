import type { CSSProperties } from 'react';

// Deterministic spread so the field looks random but is stable between renders.
const EMBERS = Array.from({ length: 18 }, (_, i) => ({
  left: (i * 37 + 11) % 100,
  size: 2 + ((i * 7) % 4),
  duration: 16 + ((i * 5) % 14),
  delay: -((i * 3.7) % 24),
  dx: ((i % 5) - 2) * 22,
  opacity: 0.3 + ((i * 13) % 5) / 12,
  sway: 4 + (i % 4),
}));

/** Faint embers drifting up the page, like sparks rising from distant diyas. */
export function FloatingEmbers() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {EMBERS.map((e, i) => (
        <span
          key={i}
          className="absolute -bottom-4 animate-drift"
          style={
            {
              left: `${e.left}%`,
              animationDuration: `${e.duration}s`,
              animationDelay: `${e.delay}s`,
              '--dx': `${e.dx}px`,
              '--o': e.opacity,
            } as CSSProperties
          }
        >
          <span
            className="block animate-sway rounded-full bg-ember-glow"
            style={{
              width: e.size,
              height: e.size,
              animationDuration: `${e.sway}s`,
              boxShadow: `0 0 ${e.size * 3}px ${e.size}px rgba(251, 191, 36, 0.45)`,
            }}
          />
        </span>
      ))}
    </div>
  );
}
