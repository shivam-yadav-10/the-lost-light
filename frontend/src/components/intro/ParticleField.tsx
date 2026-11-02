import { useMemo, type CSSProperties } from 'react';
import { FloatingEmbers } from '../FloatingEmbers';

interface ParticleFieldProps {
  /** 'low' for a quiet scene, 'high' for a busier, more charged moment. */
  density?: 'low' | 'high';
  /** A brief visual disturbance — used for the "something went wrong" beat. */
  glitch?: boolean;
  className?: string;
}

/** Ambient depth behind every scene: a twinkling star layer plus drifting embers. */
export function ParticleField({ density = 'low', glitch = false, className = '' }: ParticleFieldProps) {
  const starCount = density === 'high' ? 44 : 24;
  const stars = useMemo(
    () =>
      Array.from({ length: starCount }, (_, i) => ({
        left: (i * 31 + 9) % 100,
        top: (i * 19 + 4) % 75,
        size: 1 + ((i * 5) % 3) * 0.5,
        delay: (i * 0.41) % 6,
        duration: 4 + ((i * 3) % 5),
      })),
    [starCount],
  );

  return (
    <div aria-hidden="true" className={`pointer-events-none fixed inset-0 overflow-hidden ${glitch ? 'intro-glitch' : ''} ${className}`}>
      <div className="opacity-70">
        {stars.map((s, i) => (
          <span
            key={i}
            className="story-twinkle absolute rounded-full bg-parchment"
            style={
              {
                left: `${s.left}%`,
                top: `${s.top}%`,
                width: s.size,
                height: s.size,
                animationDuration: `${s.duration}s`,
                animationDelay: `${s.delay}s`,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <FloatingEmbers />
    </div>
  );
}
