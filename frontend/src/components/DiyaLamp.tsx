import { useEffect, useId, useState, type CSSProperties, type SVGProps } from 'react';
import type { FragmentState } from '../api/types';

interface DiyaLampProps {
  state: FragmentState;
  size?: number;
  className?: string;
  /** Delay (ms) before a lit lamp's ignite animation plays, used to stagger a row of lamps. */
  igniteDelay?: number;
}

const BOTTOM_ORIGIN = { transformBox: 'fill-box', transformOrigin: '50% 100%' } as const;
const CENTER_ORIGIN = { transformBox: 'fill-box', transformOrigin: '50% 50%' } as const;
const IGNITE_MS = 900;

/*
 * Flame outlines to morph between. Every shape keeps the base fixed at (60, 82) and uses the
 * same commands, so the browser interpolates smoothly: the body bends into a gentle S-curve
 * and the tip waves side to side like a real flame in still air.
 */
const OUTER_FLAME = [
  'M60 30 C74 52 76 68 60 82 C44 68 46 52 60 30 Z',
  'M62.5 31 C75 51 76.5 68 60 82 C44 68 47.5 50 62.5 31 Z',
  'M61 29.5 C73.5 53 75 67.5 60 82 C43.5 68.5 45.5 53 61 29.5 Z',
  'M57.5 31 C72.5 50.5 75.5 68.5 60 82 C44.5 67.5 44.5 51 57.5 31 Z',
  'M59 30 C73.5 52.5 76.5 67.5 60 82 C44 68 45.5 52.5 59 30 Z',
];
const INNER_FLAME = [
  'M60 50 C67 62 68 72 60 80 C52 72 53 62 60 50 Z',
  'M59 50.5 C66 62.5 67.5 72 60 80 C52.5 72 52 62 59 50.5 Z',
  'M61.2 49.5 C68 61.5 68 72 60 80 C52 72 54 61.5 61.2 49.5 Z',
  'M60.5 50.5 C67.5 62 68.5 71.5 60 80 C51.5 72.5 53.5 62 60.5 50.5 Z',
];

export function loop(shapes: string[]) {
  const values = [...shapes, shapes[0]];
  const steps = values.length - 1;
  return {
    values: values.join(';'),
    keyTimes: values.map((_, i) => (i / steps).toFixed(3)).join(';'),
    keySplines: Array.from({ length: steps }, () => '0.45 0 0.55 1').join(';'),
  };
}
const OUTER_WAVE = loop(OUTER_FLAME);
const INNER_WAVE = loop(INNER_FLAME);

export function usePrefersReducedMotion() {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setReduced(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

/** A flame path that waves through the given outlines (SMIL), or holds still for reduced motion. */
export function WavyPath({
  wave,
  still,
  duration,
  reduced,
  ...rest
}: {
  wave: ReturnType<typeof loop>;
  still: string;
  duration: string;
  reduced: boolean;
} & SVGProps<SVGPathElement>) {
  return (
    <path d={still} {...rest}>
      {!reduced && (
        <animate
          attributeName="d"
          dur={duration}
          repeatCount="indefinite"
          calcMode="spline"
          values={wave.values}
          keyTimes={wave.keyTimes}
          keySplines={wave.keySplines}
        />
      )}
    </path>
  );
}

// Sparks rising off the flame tip: x position, sideways drift, delay (ms) and radius.
const FLAME_SPARKS = [
  { x: 58, dx: -10, delay: 0, r: 1.1 },
  { x: 62, dx: 12, delay: 900, r: 0.9 },
  { x: 60, dx: -4, delay: 1700, r: 1.3 },
  { x: 61, dx: 7, delay: 2300, r: 0.8 },
];

/**
 * Detailed clay diya with three animated states:
 * LOCKED = cold and unlit with drifting smoke, AVAILABLE = ember glowing on the wick,
 * SOLVED = ignites, then a swaying, flickering flame throws sparks and light onto the ledge.
 */
export function DiyaLamp({ state, size = 140, className = '', igniteDelay = 0 }: DiyaLampProps) {
  const id = useId().replace(/:/g, '');
  const lit = state === 'SOLVED';
  const ready = state === 'AVAILABLE';
  const reduced = usePrefersReducedMotion();
  const ignite: CSSProperties = { animationDelay: `${igniteDelay}ms` };

  return (
    <svg
      width={size}
      height={(size * 150) / 120}
      viewBox="0 0 120 150"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <defs>
        <radialGradient id={`halo-${id}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fde68a" stopOpacity="0.55" />
          <stop offset="40%" stopColor="#f59e0b" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`floor-${id}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f59e0b" stopOpacity={lit ? 0.45 : 0.15} />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`flame-${id}`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#f97316" />
          <stop offset="45%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#fde68a" stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id={`clay-${id}`} x1="0" y1="0" x2="0" y2="1">
          {lit || ready ? (
            <>
              <stop offset="0%" stopColor={lit ? '#a8521a' : '#7a3c12'} />
              <stop offset="100%" stopColor="#2e1606" />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor="#56402f" />
              <stop offset="100%" stopColor="#1e1611" />
            </>
          )}
        </linearGradient>
        <linearGradient id={`oil-${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#1a0e05" />
          <stop offset="50%" stopColor={lit ? '#5a3410' : '#2a1a0c'} />
          <stop offset="100%" stopColor="#1a0e05" />
        </linearGradient>
      </defs>

      {/* light pooled on the ledge */}
      {(lit || ready) && (
        <ellipse
          cx="60"
          cy="134"
          rx="56"
          ry="9"
          fill={`url(#floor-${id})`}
          className={lit ? 'diya-halo' : 'animate-ember'}
          style={CENTER_ORIGIN}
        />
      )}

      {/* halo behind the flame */}
      {lit && (
        <g className="animate-ignite" style={{ ...CENTER_ORIGIN, ...ignite }}>
          <circle cx="60" cy="58" r="58" fill={`url(#halo-${id})`} className="diya-halo" style={CENTER_ORIGIN} />
        </g>
      )}

      {/* smoke drifting from a cold wick */}
      {state === 'LOCKED' && (
        <>
          <path
            d="M64 82 C58 72 70 66 62 56 C56 48 66 42 60 32"
            stroke="#c8bfb0"
            strokeOpacity="0.22"
            strokeWidth="1.6"
            strokeLinecap="round"
            className="animate-smoke"
            style={BOTTOM_ORIGIN}
          />
          <path
            d="M60 80 C66 70 56 62 63 52 C68 44 58 38 62 28"
            stroke="#c8bfb0"
            strokeOpacity="0.14"
            strokeWidth="1.2"
            strokeLinecap="round"
            className="animate-smoke"
            style={{ ...BOTTOM_ORIGIN, animationDelay: '2.5s' }}
          />
        </>
      )}

      {/* bowl */}
      <path d="M8 96 Q60 84 112 96 Q106 128 60 132 Q14 128 8 96 Z" fill={`url(#clay-${id})`} />
      <path
        d="M8 96 Q60 84 112 96"
        stroke={lit ? '#fbbf24' : ready ? '#f59e0b' : '#7a6150'}
        strokeOpacity={lit ? 0.7 : ready ? 0.45 : 0.55}
        strokeWidth="1.2"
      />
      {/* rangoli dot band */}
      {[22, 34, 47, 60, 73, 86, 98].map((x, i) => (
        <circle
          key={x}
          cx={x}
          cy={i === 0 || i === 6 ? 108 : i === 1 || i === 5 ? 112 : 114}
          r="1.6"
          fill={lit ? '#fde68a' : ready ? '#f59e0b' : '#6b5545'}
          opacity={lit ? 0.8 : 0.5}
          className={lit ? 'animate-ember' : undefined}
          style={lit ? { ...CENTER_ORIGIN, animationDelay: `${i * 220}ms` } : undefined}
        />
      ))}
      <path
        d="M20 104 Q60 124 100 104"
        stroke={lit ? '#f59e0b' : '#4a3a2e'}
        strokeOpacity="0.35"
        strokeWidth="0.8"
      />

      {/* oil surface + spout */}
      <ellipse cx="60" cy="95" rx="46" ry="7" fill={`url(#oil-${id})`} />
      {lit && (
        <ellipse
          cx="60"
          cy="94"
          rx="18"
          ry="2.2"
          fill="#fde68a"
          opacity="0.22"
          className="diya-halo"
          style={CENTER_ORIGIN}
        />
      )}
      <path d="M54 92 Q60 82 66 92 Z" fill={`url(#clay-${id})`} />

      {/* wick */}
      <path d="M60 90 Q59 85 60 80" stroke={lit || ready ? '#3a1d06' : '#1c140f'} strokeWidth="2.4" strokeLinecap="round" />

      {/* ember waiting to be lit */}
      {ready && (
        <>
          <g className="animate-ember" style={CENTER_ORIGIN}>
            <circle cx="60" cy="79" r="9" fill={`url(#halo-${id})`} />
            <circle cx="60" cy="79.5" r="2.2" fill="#fb923c" />
            <circle cx="60" cy="79.5" r="1" fill="#fde68a" />
          </g>
          <circle
            cx="60"
            cy="76"
            r="0.8"
            fill="#fde68a"
            className="animate-spark"
            style={{ ...CENTER_ORIGIN, opacity: 0, animationDuration: '4.5s', ['--dx' as string]: '5px' }}
          />
        </>
      )}

      {/* flame: ignites once, then sways while its bright core flickers */}
      {lit && (
        <g className="animate-ignite" style={{ ...BOTTOM_ORIGIN, ...ignite }}>
          <g className="diya-flicker" style={BOTTOM_ORIGIN}>
            <WavyPath
              wave={OUTER_WAVE}
              still={OUTER_FLAME[0]}
              duration="3.6s"
              reduced={reduced}
              fill={`url(#flame-${id})`}
              opacity="0.95"
            />
            <WavyPath
              wave={INNER_WAVE}
              still={INNER_FLAME[0]}
              duration="2.9s"
              reduced={reduced}
              fill="#fff4cc"
              opacity="0.92"
              className="diya-core"
              style={BOTTOM_ORIGIN}
            />
            <ellipse cx="60" cy="76" rx="3" ry="4" fill="#60a5fa" opacity="0.35" />
          </g>
        </g>
      )}

      {/* sparks lifting off the flame */}
      {lit &&
        FLAME_SPARKS.map((s) => (
          <circle
            key={s.delay}
            cx={s.x}
            cy="36"
            r={s.r}
            fill="#fde68a"
            className="animate-spark"
            style={{
              ...CENTER_ORIGIN,
              opacity: 0,
              animationDelay: `${igniteDelay + IGNITE_MS + s.delay}ms`,
              ['--dx' as string]: `${s.dx}px`,
            }}
          />
        ))}
    </svg>
  );
}
