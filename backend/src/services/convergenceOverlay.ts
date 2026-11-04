import { createHmac } from 'node:crypto';
import { config } from '../config.js';

export const OVERLAY_WORD = 'UNITE';
export const OVERLAY_WIDTH = 31;
export const OVERLAY_HEIGHT = 9;
const GLYPHS: Record<string, string[]> = {
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  N: ['10001', '11001', '11001', '10101', '10011', '10011', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
};

export interface OverlayCard {
  width: number;
  height: number;
  lit: number[];
}

export interface ConvergenceAssignment {
  version: 2;
  memberIds: string[];
  seal: string;
  card: OverlayCard;
  riddleSet?: string;
}

export interface Placement { teamId: string; x: number; y: number; rotation: number }

export function wordPixels(): Set<number> {
  const pixels = new Set<number>();
  [...OVERLAY_WORD].forEach((letter, index) => {
    GLYPHS[letter].forEach((row, y) => {
      [...row].forEach((pixel, x) => {
        if (pixel === '1') pixels.add((y + 1) * OVERLAY_WIDTH + index * 6 + x + 1);
      });
    });
  });
  return pixels;
}

/** Every bright pixel belongs to exactly one team; only the full union has the clean dark lettering. */
export function buildOverlayCards(memberIds: string[]): OverlayCard[] {
  if (memberIds.length !== 2 && memberIds.length !== 3) throw new Error('A lantern circle needs two or three teams.');
  const dark = wordPixels();
  const cards = memberIds.map(() => ({ width: OVERLAY_WIDTH, height: OVERLAY_HEIGHT, lit: [] as number[] }));
  const seed = memberIds.join('|');
  for (let pixel = 0; pixel < OVERLAY_WIDTH * OVERLAY_HEIGHT; pixel++) {
    if (dark.has(pixel)) continue;
    const byte = createHmac('sha256', config.gameSecret).update(`overlay-v2:${seed}:${pixel}`).digest()[0];
    cards[byte % cards.length].lit.push(pixel);
  }
  return cards;
}

/** Keep provisioned circles intact. A new roster is paired once, with its final three forming a triple. */
export function planConvergenceGroups(
  teams: Array<{ id: string; teamNumber: number }>,
  existing: Map<string, ConvergenceAssignment>,
): string[][] {
  const ids = new Set(teams.map((team) => team.id));
  if (ids.size !== teams.length || new Set(teams.map((team) => team.teamNumber)).size !== teams.length) {
    throw new Error('Team ids and team numbers must be unique.');
  }
  const groups: string[][] = [];
  const seen = new Set<string>();
  for (const [id, assignment] of existing) {
    if (!ids.has(id)) continue;
    const members = assignment.memberIds;
    if (assignment.version !== 2 || !Array.isArray(members) || !members.includes(id)
      || (members.length !== 2 && members.length !== 3) || new Set(members).size !== members.length
      || members.some((member) => !ids.has(member)
        || JSON.stringify(existing.get(member)?.memberIds) !== JSON.stringify(members))) {
      throw new Error(`Invalid or incomplete persisted convergence circle for ${id}; refusing to re-pair teams.`);
    }
    if (!seen.has(id)) {
      groups.push([...members]);
      members.forEach((member) => seen.add(member));
    }
  }
  const pending = teams.filter((team) => !seen.has(team.id)).sort((a, b) => a.teamNumber - b.teamNumber);
  const triples = groups.filter((group) => group.length === 3).length;
  if (triples > 1 || (triples === 1 && pending.length % 2 !== 0)) {
    throw new Error('This roster change would require altering a persisted triple. Add teams in pairs or arrange an explicit organiser-reviewed circle migration.');
  }
  if (pending.length === 1) {
    throw new Error('One unassigned team remains. Provision new teams in batches of two or three; existing circles will not be changed automatically.');
  }
  while (pending.length) {
    groups.push(pending.splice(0, pending.length === 3 ? 3 : 2).map((team) => team.id));
  }
  return groups;
}

export function parseAlignment(raw: string | undefined, memberIds: string[], ownId: string): Placement[] {
  let value: unknown;
  try { value = JSON.parse(raw ?? 'null'); } catch { throw new Error('Align every partner card before offering the word.'); }
  const partners = memberIds.filter((id) => id !== ownId);
  if (!Array.isArray(value) || value.length !== partners.length
    || !partners.every((id) => value.filter((p) => p?.teamId === id).length === 1)
    || !value.every((p) => p && partners.includes(p.teamId) && p.x === 0 && p.y === 0
      && Number.isInteger(p.rotation) && p.rotation % 360 === 0)) {
    throw new Error('Align every partner card before offering the word.');
  }
  return value as Placement[];
}
