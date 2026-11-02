import type { CSSProperties } from 'react';

type FlameIntensity = 'spark' | 'glow' | 'blaze';

interface FlameProps {
  size?: number;
  intensity?: FlameIntensity;
  className?: string;
}

// Three rising sparks off the tip, reused from the diya's own flame for visual consistency.
const SPARKS = [
  { x: -6, dx: -10, delay: 0 },
  { x: 6, dx: 12, delay: 900 },
  { x: 0, dx: -4, delay: 1700 },
];

/**
 * A standalone cinematic flame with a soft halo, independent of the clay diya graphic — used
 * throughout the intro where the flame itself is the subject rather than a dashboard fragment.
 * `intensity` scales the halo from a single ember ("spark") up to a screen-filling "blaze".
 */
export function Flame({ size = 64, intensity = 'glow', className = '' }: FlameProps) {
  const haloScale = intensity === 'blaze' ? 3 : intensity === 'glow' ? 1.7 : 1;
  const flameOpacity = intensity === 'spark' ? 0.75 : 1;
  return (
    <div
      aria-hidden="true"
      className={`relative flex items-center justify-center ${className}`}
      style={{ width: size, height: size * 1.3 }}
    >
      <div
        className="absolute animate-glow-breathe rounded-full"
        style={{
          width: size * haloScale,
          height: size * haloScale,
          background: 'radial-gradient(circle, rgba(253,230,138,0.55), rgba(245,158,11,0.18) 45%, transparent 72%)',
        }}
      />
      <svg
        width={size * 0.5}
        height={size}
        viewBox="0 0 40 80"
        className="relative animate-flicker"
        style={{ transformOrigin: '50% 100%' }}
      >
        <defs>
          <linearGradient id="flame-body" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#f97316" />
            <stop offset="45%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#fde68a" stopOpacity="0.9" />
          </linearGradient>
        </defs>
        <path d="M20 10 C30 28 32 44 20 70 C8 44 10 28 20 10 Z" fill="url(#flame-body)" opacity={flameOpacity} />
        <path d="M20 34 C25 44 25 56 20 68 C15 56 15 44 20 34 Z" fill="#fff4cc" opacity={flameOpacity * 0.9} />
      </svg>
      {intensity !== 'spark' &&
        SPARKS.map((s) => (
          <span
            key={s.delay}
            className="absolute top-2 h-1 w-1 rounded-full bg-ember-glow animate-spark"
            style={
              {
                left: `calc(50% + ${s.x}px)`,
                opacity: 0,
                animationDelay: `${s.delay}ms`,
                ['--dx' as string]: `${s.dx}px`,
              } as CSSProperties
            }
          />
        ))}
    </div>
  );
}
