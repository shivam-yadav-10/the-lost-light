const UNIT_WIDTH = 160;
const UNITS = 18;

// Marigolds strung along the curve y = 2 + 64·t(1−t), the quadratic M0 2 Q80 34 160 2.
const FLOWERS = Array.from({ length: 9 }, (_, i) => {
  const t = (i + 1) / 10;
  return { x: UNIT_WIDTH * t, y: 2 + 64 * t * (1 - t), color: i % 2 === 0 ? '#f97316' : '#f59e0b' };
});

/** A flower-and-leaf toran strung across the top of the page, swaying gently. */
export function Toran() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 z-20 flex h-11 overflow-hidden opacity-60">
      {Array.from({ length: UNITS }, (_, i) => (
        <svg
          key={i}
          width={UNIT_WIDTH}
          height="44"
          viewBox={`0 0 ${UNIT_WIDTH} 44`}
          className="shrink-0 animate-toran-sway"
          style={{ transformOrigin: '50% 0', animationDelay: `${(i % 3) * -2}s` }}
        >
          <path d="M0 2 Q80 34 160 2" stroke="#b45309" strokeOpacity="0.6" strokeWidth="1" fill="none" />
          <path d="M80 18 C87 25 85 34 80 40 C75 34 73 25 80 18 Z" fill="#3f6b2a" opacity="0.75" />
          <path d="M80 20 L80 38" stroke="#6b9a45" strokeOpacity="0.5" strokeWidth="0.6" />
          {FLOWERS.map((f) => (
            <g key={f.x}>
              <circle cx={f.x} cy={f.y} r="4.4" fill={f.color} />
              <circle cx={f.x} cy={f.y} r="2" fill="#b45309" opacity="0.55" />
            </g>
          ))}
        </svg>
      ))}
    </div>
  );
}
