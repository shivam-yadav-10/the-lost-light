import { useState } from 'react';
import type { MandalaCell, SceneLamp } from '../api/types';
import { Motif } from './RangoliMotif';
import { SPOKES, polar } from './wheel';

const W = 1200;
const H = 720;
const GROUND = 420;
const RANGOLI = { x: 600, y: 565, radii: [22, 40, 58, 76, 94] };
const ZOOMS = [1, 1.75, 2.5];

// Decorative scenery only. The puzzle data (hidden lamps, rangoli letters) comes from the API.
const STARS = Array.from({ length: 46 }, (_, i) => ({ x: (i * 263 + 37) % W, y: (i * 97 + 13) % 300, r: 0.6 + (i % 3) * 0.4 }));

const HOUSES = [
  { x: 40, w: 200, top: 190, roof: 'peak' as const, colour: '#2b2656' },
  { x: 240, w: 190, top: 230, roof: 'flat' as const, colour: '#25204b' },
  { x: 430, w: 170, top: 205, roof: 'flat' as const, colour: '#2e2860' },
  { x: 600, w: 200, top: 185, roof: 'dome' as const, colour: '#282351' },
  { x: 800, w: 190, top: 235, roof: 'flat' as const, colour: '#2c275a' },
  { x: 990, w: 210, top: 205, roof: 'peak' as const, colour: '#25204b' },
];

const PEOPLE = [
  { x: 180, y: 600, c: '#7c2d12' },
  { x: 470, y: 520, c: '#1e3a8a' },
  { x: 760, y: 515, c: '#831843' },
  { x: 1010, y: 610, c: '#14532d' },
  { x: 1110, y: 520, c: '#713f12' },
  { x: 90, y: 500, c: '#4c1d95' },
];

const FIREWORKS = [
  { x: 300, y: 110, r: 60, c: '#f97316' },
  { x: 548, y: 78, r: 46, c: '#fde68a' },
  { x: 905, y: 120, r: 70, c: '#f472b6' },
];

function Lamp({ lamp }: { lamp: SceneLamp }) {
  return (
    <g transform={`translate(${lamp.x} ${lamp.y})`}>
      {lamp.lit && <circle cy="-6" r="11" fill="#fbbf24" fillOpacity="0.18" />}
      {lamp.lit && <path d="M0 -14 C3.5 -9 3.5 -5 0 -2.5 C-3.5 -5 -3.5 -9 0 -14 Z" fill="#fbbf24" />}
      {lamp.lit && <path d="M0 -10 C1.6 -7.5 1.6 -5 0 -3.5 C-1.6 -5 -1.6 -7.5 0 -10 Z" fill="#fff4cc" />}
      <path d="M-8 -2 Q0 -4 8 -2 Q6 4 0 4.5 Q-6 4 -8 -2 Z" fill={lamp.lit ? '#b45309' : '#4a3a2e'} />
      <text
        y={lamp.lit ? -18 : -8}
        textAnchor="middle"
        fontSize="10"
        fontWeight="700"
        fill="#f5e6c8"
        fontFamily="Manrope Variable, Manrope, system-ui, sans-serif"
      >
        {lamp.letter}
      </text>
    </g>
  );
}

function House({ h }: { h: (typeof HOUSES)[number] }) {
  const cx = h.x + h.w / 2;
  const windows = [];
  for (let wx = h.x + 22; wx < h.x + h.w - 30; wx += 44) {
    for (let wy = h.top + 26; wy < GROUND - 70; wy += 54) {
      const lit = (wx * 7 + wy * 3) % 5 < 2;
      windows.push(
        <rect key={`${wx}-${wy}`} x={wx} y={wy} width="22" height="28" rx="3" fill={lit ? '#f59e0b' : '#120f2a'} fillOpacity={lit ? 0.5 : 0.85} />,
      );
    }
  }
  return (
    <g>
      {h.roof === 'peak' && <path d={`M${h.x - 8} ${h.top} L${cx} ${h.top - 50} L${h.x + h.w + 8} ${h.top} Z`} fill="#3a3470" />}
      {h.roof === 'dome' && <path d={`M${cx - 45} ${h.top} A45 40 0 0 1 ${cx + 45} ${h.top} Z`} fill="#3a3470" />}
      <rect x={h.x} y={h.top} width={h.w} height={GROUND - h.top} fill={h.colour} />
      {h.roof === 'flat' && <rect x={h.x - 4} y={h.top - 8} width={h.w + 8} height="8" fill="#3a3470" />}
      {windows}
      <rect x={cx - 22} y={GROUND - 62} width="44" height="62" rx="20" fill="#0b0a1a" />
      {/* toran over the door */}
      <path d={`M${cx - 34} ${GROUND - 70} Q${cx} ${GROUND - 56} ${cx + 34} ${GROUND - 70}`} stroke="#f97316" strokeWidth="2.5" strokeDasharray="1 5" strokeLinecap="round" fill="none" />
    </g>
  );
}

function Person({ x, y, c }: { x: number; y: number; c: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle cy="-46" r="9" fill="#2a1d17" />
      <path d="M-14 0 Q-15 -34 0 -36 Q15 -34 14 0 Z" fill={c} />
      <rect x="-9" y="0" width="7" height="16" rx="3" fill="#120f24" />
      <rect x="2" y="0" width="7" height="16" rx="3" fill="#120f24" />
    </g>
  );
}

function Stall({ x, w, top, stripe }: { x: number; w: number; top: number; stripe: string }) {
  const stripes = [];
  for (let sx = x; sx < x + w; sx += 24) {
    stripes.push(<rect key={sx} x={sx} y={top} width="12" height="26" fill={stripe} />);
  }
  return (
    <g>
      <rect x={x + 6} y={top + 26} width="5" height="104" fill="#3a2a1f" />
      <rect x={x + w - 11} y={top + 26} width="5" height="104" fill="#3a2a1f" />
      <rect x={x} y={top} width={w} height="26" fill="#f5e6c8" fillOpacity="0.85" />
      {stripes}
      <path d={`M${x} ${top + 26} Q${x + 12} ${top + 36} ${x + 24} ${top + 26}`} fill="none" />
      <rect x={x} y={top + 74} width={w} height="56" rx="4" fill="#5b3a1f" />
      <rect x={x} y={top + 74} width={w} height="6" fill="#7c4a22" />
    </g>
  );
}

/** The Festival Street: a hidden-object scene with a great rangoli in its square and a magnifier. */
export function StreetScene({ caption, rangoli, lamps }: { caption: string; rangoli: MandalaCell[]; lamps: SceneLamp[] }) {
  const [zoomIndex, setZoomIndex] = useState(0);
  const zoom = ZOOMS[zoomIndex];

  return (
    <figure>
      <div className="mb-3 flex items-center justify-between gap-3">
        <figcaption className="text-sm text-parchment/60">{caption}</figcaption>
        <div className="flex shrink-0 items-center gap-2" role="group" aria-label="Magnifier">
          <button
            type="button"
            className="btn-ghost !h-9 !w-9 !p-0 text-lg"
            onClick={() => setZoomIndex((i) => Math.max(0, i - 1))}
            disabled={zoomIndex === 0}
            aria-label="Zoom out"
          >
            −
          </button>
          <span className="w-12 text-center text-xs tabular-nums text-parchment/60" aria-live="polite">
            {zoom}×
          </span>
          <button
            type="button"
            className="btn-ghost !h-9 !w-9 !p-0 text-lg"
            onClick={() => setZoomIndex((i) => Math.min(ZOOMS.length - 1, i + 1))}
            disabled={zoomIndex === ZOOMS.length - 1}
            aria-label="Zoom in"
          >
            +
          </button>
        </div>
      </div>

      <div className="max-h-[72vh] overflow-auto rounded-2xl border border-ember/20 bg-midnight" tabIndex={0} aria-label="Festival street scene, scrollable when zoomed">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: `${zoom * 100}%` }}
          className="block h-auto"
          role="img"
          aria-label="A busy Diwali street at night with houses, stalls, people, fireworks and a large rangoli in the square"
        >
          <defs>
            <linearGradient id="street-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0b0a24" />
              <stop offset="100%" stopColor="#2a2556" />
            </linearGradient>
            <linearGradient id="street-ground" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2a2348" />
              <stop offset="100%" stopColor="#17142e" />
            </linearGradient>
          </defs>

          <rect width={W} height={GROUND} fill="url(#street-sky)" />
          {STARS.map((s, i) => (
            <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#f5e6c8" fillOpacity="0.5" />
          ))}
          {FIREWORKS.map((f) => (
            <g key={f.x} stroke={f.c} strokeOpacity="0.75" strokeWidth="2" strokeLinecap="round">
              {Array.from({ length: 14 }, (_, i) => {
                const a = (i / 14) * Math.PI * 2;
                return (
                  <line
                    key={i}
                    x1={f.x + Math.cos(a) * f.r * 0.35}
                    y1={f.y + Math.sin(a) * f.r * 0.35}
                    x2={f.x + Math.cos(a) * f.r}
                    y2={f.y + Math.sin(a) * f.r}
                  />
                );
              })}
            </g>
          ))}

          {HOUSES.map((h) => (
            <House key={h.x} h={h} />
          ))}

          {/* string of lights between rooftops, with star lanterns */}
          <path d="M40 250 Q320 300 600 250 T1200 250" stroke="#f97316" strokeOpacity="0.7" strokeWidth="3" strokeDasharray="1 7" strokeLinecap="round" fill="none" />
          {[180, 470, 760, 1060].map((x, i) => (
            <g key={x} transform={`translate(${x} ${270 + (i % 2) * 14})`}>
              <line y1="-18" y2="0" stroke="#a16207" />
              <path d="M0 0 L7 10 L0 22 L-7 10 Z" fill="#f97316" fillOpacity="0.85" />
            </g>
          ))}

          {/* tree */}
          <rect x="1055" y="320" width="14" height="100" fill="#3a2a1f" />
          {[
            [1062, 300, 46],
            [1030, 318, 30],
            [1094, 318, 32],
            [1062, 268, 30],
          ].map(([cx, cy, r]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill="#14532d" fillOpacity="0.9" />
          ))}

          <rect y={GROUND} width={W} height={H - GROUND} fill="url(#street-ground)" />
          <path d={`M0 ${GROUND + 6} H${W}`} stroke="#f59e0b" strokeOpacity="0.15" />

          <Stall x={230} w={180} top={430} stripe="#b91c1c" />
          {/* sweet boxes on the stall shelf */}
          {[248, 280, 340, 372].map((x) => (
            <rect key={x} x={x} y="492" width="24" height="14" rx="2" fill={x % 3 === 0 ? '#f59e0b' : '#db2777'} fillOpacity="0.8" />
          ))}
          <Stall x={790} w={180} top={430} stripe="#1d4ed8" />
          {[815, 880, 945].map((x) => (
            <path key={x} d={`M${x} 466 L${x + 8} 478 L${x} 492 L${x - 8} 478 Z`} fill="#f97316" fillOpacity="0.8" />
          ))}

          {/* the great rangoli in the square */}
          <g>
            <circle cx={RANGOLI.x} cy={RANGOLI.y} r={RANGOLI.radii[4] + 14} fill="#12102a" stroke="#f59e0b" strokeOpacity="0.25" />
            {RANGOLI.radii.map((r) => (
              <circle key={r} cx={RANGOLI.x} cy={RANGOLI.y} r={r} fill="none" stroke="#f59e0b" strokeOpacity="0.12" />
            ))}
            {SPOKES.map((s) => {
              const label = polar(s, RANGOLI.radii[4] + 22, 0);
              return (
                <text
                  key={s}
                  x={RANGOLI.x + label.x}
                  y={RANGOLI.y + label.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize="10"
                  fill="#fde68a"
                  fillOpacity="0.7"
                  fontFamily="Manrope Variable, Manrope, system-ui, sans-serif"
                >
                  {s}
                </text>
              );
            })}
            <circle cx={RANGOLI.x} cy={RANGOLI.y} r="7" fill="#fde68a" fillOpacity="0.8" />
            {rangoli.map((cell) => {
              const radius = RANGOLI.radii[cell.ring - 1];
              const at = polar(cell.spoke, radius, 0);
              const label = polar(cell.spoke, radius - 10, 0);
              return (
                <g key={`${cell.ring}-${cell.spoke}`}>
                  <g transform={`translate(${RANGOLI.x + at.x} ${RANGOLI.y + at.y}) rotate(${at.degrees + cell.rotate}) scale(${0.5 * cell.scale})`}>
                    <Motif cell={cell} />
                  </g>
                  <text
                    x={RANGOLI.x + label.x}
                    y={RANGOLI.y + label.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize="8.5"
                    fontWeight="700"
                    fill="#f5e6c8"
                    fontFamily="Manrope Variable, Manrope, system-ui, sans-serif"
                  >
                    {cell.letter}
                  </text>
                </g>
              );
            })}
          </g>

          {/* cart */}
          <g>
            <rect x="800" y="600" width="130" height="44" rx="6" fill="#7c4a22" />
            <rect x="806" y="588" width="118" height="14" rx="4" fill="#f59e0b" fillOpacity="0.5" />
            <line x1="930" y1="612" x2="970" y2="596" stroke="#5b3a1f" strokeWidth="5" strokeLinecap="round" />
            <circle cx="825" cy="664" r="16" fill="none" stroke="#3a2a1f" strokeWidth="5" />
            <circle cx="905" cy="664" r="16" fill="none" stroke="#3a2a1f" strokeWidth="5" />
          </g>

          {PEOPLE.map((p) => (
            <Person key={p.x} {...p} />
          ))}

          {lamps.map((lamp) => (
            <Lamp key={`${lamp.x}-${lamp.y}`} lamp={lamp} />
          ))}
        </svg>
      </div>
    </figure>
  );
}
