import type { Spoke } from '../api/types';

export const SPOKES: Spoke[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** Polar layout used by both the Spark rangoli and the Convergence lantern. N is up, spokes go clockwise. */
export function polar(spoke: Spoke, radius: number, centre: number) {
  const angle = (SPOKES.indexOf(spoke) * 45 - 90) * (Math.PI / 180);
  return { x: centre + radius * Math.cos(angle), y: centre + radius * Math.sin(angle), degrees: SPOKES.indexOf(spoke) * 45 };
}

/** Faint rings, spoke lines and compass labels. */
export function WheelGuides({ centre, radii, labelRadius }: { centre: number; radii: number[]; labelRadius: number }) {
  const outer = radii[radii.length - 1];
  return (
    <g aria-hidden="true">
      {radii.map((r) => (
        <circle key={r} cx={centre} cy={centre} r={r} fill="none" stroke="#f59e0b" strokeOpacity="0.12" />
      ))}
      {SPOKES.map((s) => {
        const end = polar(s, outer + 14, centre);
        const label = polar(s, labelRadius, centre);
        return (
          <g key={s}>
            <line x1={centre} y1={centre} x2={end.x} y2={end.y} stroke="#f59e0b" strokeOpacity="0.08" />
            <text
              x={label.x}
              y={label.y}
              textAnchor="middle"
              dominantBaseline="central"
              fill="#fde68a"
              fillOpacity="0.75"
              fontSize="13"
              fontFamily="Manrope Variable, Manrope, system-ui, sans-serif"
              letterSpacing="1"
            >
              {s}
            </text>
          </g>
        );
      })}
    </g>
  );
}
