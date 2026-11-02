import { WavyPath, loop, usePrefersReducedMotion } from './DiyaLamp';

// Logo flame outlines (base fixed at y=39); the tip waves gently between them.
const LOGO_OUTER = [
  'M32 13 C40 21 42 31 32 39 C22 31 24 21 32 13 Z',
  'M33.5 13.5 C41 21 42 31 32 39 C22 31 25.5 20.5 33.5 13.5 Z',
  'M30.5 13.5 C39 21.5 42 31 32 39 C22 31 23 21 30.5 13.5 Z',
];
const LOGO_INNER = [
  'M32 21.5 C36 26 37 32 32 36.5 C27 32 28 26 32 21.5 Z',
  'M31.3 21.8 C35.5 26 36.8 32 32 36.5 C27.2 32 27.5 26 31.3 21.8 Z',
  'M32.7 21.3 C36.5 26 37 32 32 36.5 C27 32 28.5 26 32.7 21.3 Z',
];
const LOGO_OUTER_WAVE = loop(LOGO_OUTER);
const LOGO_INNER_WAVE = loop(LOGO_INNER);

interface DiyaProps {
  size?: number;
  lit?: boolean;
  className?: string;
}

/** Minimal diya glyph: clay bowl + flame. Flame flickers when lit. */
export function Diya({ size = 48, lit = true, className = '' }: DiyaProps) {
  const reduced = usePrefersReducedMotion();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      {lit && (
        <g style={{ transformBox: 'fill-box', transformOrigin: '50% 100%' }} className="diya-flicker">
          <WavyPath
            wave={LOGO_OUTER_WAVE}
            still={LOGO_OUTER[0]}
            duration="3.4s"
            reduced={reduced}
            fill="url(#flameOuter)"
            opacity="0.9"
          />
          <WavyPath
            wave={LOGO_INNER_WAVE}
            still={LOGO_INNER[0]}
            duration="2.7s"
            reduced={reduced}
            fill="#fff7d6"
            opacity="0.95"
          />
        </g>
      )}
      <path
        d="M10 40 Q32 48 54 40 Q52 54 32 56 Q12 54 10 40 Z"
        fill="url(#bowl)"
        stroke="#f59e0b"
        strokeOpacity="0.5"
        strokeWidth="1"
      />
      <ellipse cx="32" cy="40" rx="22" ry="4" fill="#3b2a12" opacity="0.7" />
      <defs>
        <radialGradient id="flameOuter" cx="50%" cy="70%" r="60%">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="55%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="bowl" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7c3f0f" />
          <stop offset="100%" stopColor="#3a1d06" />
        </linearGradient>
      </defs>
    </svg>
  );
}
