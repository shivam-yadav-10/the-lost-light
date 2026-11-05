import type { Spoke } from '../api/types';

export const SPOKES: Spoke[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** Polar layout for the Spark rangoli. N is up, spokes go clockwise. */
export function polar(spoke: Spoke, radius: number, centre: number) {
  const angle = (SPOKES.indexOf(spoke) * 45 - 90) * (Math.PI / 180);
  return { x: centre + radius * Math.cos(angle), y: centre + radius * Math.sin(angle), degrees: SPOKES.indexOf(spoke) * 45 };
}
