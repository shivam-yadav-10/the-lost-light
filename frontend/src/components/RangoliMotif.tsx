import type { MandalaCell } from '../api/types';

/** Draws one rangoli motif in local coordinates where "up" (-y) points away from the centre. */
export function Motif({ cell }: { cell: MandalaCell }) {
  const fill = cell.colour;
  switch (cell.motif) {
    case 'dot':
      return <circle r="7" fill={fill} />;
    case 'petal':
      return <path d="M0 -13 C8 -4 8 6 0 10 C-8 6 -8 -4 0 -13 Z" fill={fill} />;
    case 'diamond':
      return <path d="M0 -12 L8 0 L0 12 L-8 0 Z" fill={fill} />;
    case 'circle':
      return <circle r="9" fill={fill} />;
    case 'bead':
      return (
        <>
          <circle r="7" fill={fill} />
          <circle r="3" fill="#0b0a1a" fillOpacity="0.45" />
        </>
      );
    case 'teardrop': {
      const ys = Array.from({ length: cell.dots }, (_, i) => (i - (cell.dots - 1) / 2) * 5 + 1);
      return (
        <>
          <path d="M0 -15 C9 -3 8 9 0 11 C-8 9 -9 -3 0 -15 Z" fill={fill} />
          {ys.map((y) => (
            <circle key={y} cy={y} r="1.6" fill="#0b0a1a" />
          ))}
        </>
      );
    }
  }
}
