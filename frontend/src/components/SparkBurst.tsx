import type { CSSProperties } from 'react';

interface SparkBurstProps {
  /** Repeat the burst every few seconds instead of playing once. */
  loop?: boolean;
  count?: number;
  radius?: number;
  className?: string;
}

const COLORS = ['#fde68a', '#f59e0b', '#f97316', '#fbbf24'];

/** A phuljhadi-style burst of sparks radiating from the centre of its positioned parent. */
export function SparkBurst({ loop = false, count = 18, radius = 90, className = '' }: SparkBurstProps) {
  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-0 ${className}`}>
      {Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2;
        const distance = radius * (0.7 + (i % 3) * 0.2);
        const size = 3 + (i % 3);
        return (
          <span
            key={i}
            className={`absolute left-1/2 top-1/2 rounded-full ${loop ? 'animate-burst-loop' : 'animate-burst'}`}
            style={
              {
                width: size,
                height: size,
                background: COLORS[i % COLORS.length],
                boxShadow: `0 0 ${size * 2}px ${COLORS[i % COLORS.length]}`,
                animationDelay: `${(i % 4) * 50}ms`,
                '--x': `${Math.cos(angle) * distance}px`,
                '--y': `${Math.sin(angle) * distance}px`,
              } as CSSProperties
            }
          />
        );
      })}
    </div>
  );
}
