import type { OverlayCard, OverlayPlacement } from '../api/types';

export function overlayKeyAction(event: Pick<KeyboardEvent, 'key' | 'altKey' | 'metaKey' | 'shiftKey'>):
  { x: number; y: number; rotation: number } | null {
  if (event.altKey || event.metaKey) return null;
  const steps: Record<string, [number, number]> = {
    ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
  };
  if (steps[event.key]) return { x: steps[event.key][0], y: steps[event.key][1], rotation: 0 };
  if (event.key.toLowerCase() === 'r') return { x: 0, y: 0, rotation: event.shiftKey ? -90 : 90 };
  return null;
}

export function adjustPlacement(placement: OverlayPlacement, patch: Partial<OverlayPlacement>): OverlayPlacement {
  return {
    ...placement, ...patch,
    teamId: placement.teamId,
    x: Math.max(-8, Math.min(8, Math.round(patch.x ?? placement.x))),
    y: Math.max(-8, Math.min(8, Math.round(patch.y ?? placement.y))),
    rotation: ((patch.rotation ?? placement.rotation) % 360 + 360) % 360,
  };
}

export function parseOverlayCard(value: unknown): OverlayCard {
  if (!value || typeof value !== 'object') throw new Error('Lantern card data is missing.');
  const card = value as OverlayCard;
  if (card.width !== 31 || card.height !== 9 || !Array.isArray(card.lit) || card.lit.length === 0
    || new Set(card.lit).size !== card.lit.length
    || !card.lit.every((pixel) => Number.isInteger(pixel) && pixel >= 0 && pixel < card.width * card.height)) {
    throw new Error('Lantern card data is incomplete.');
  }
  return card;
}

export function parseMemberIds(value: unknown, ownId: string): string[] {
  if (!Array.isArray(value) || (value.length !== 2 && value.length !== 3)
    || !value.every((id) => typeof id === 'string' && id.length > 0)
    || !value.includes(ownId) || new Set(value).size !== value.length) {
    throw new Error('Your lantern circle has not been provisioned.');
  }
  return value as string[];
}

export function alignmentProof(raw: string | undefined, memberIds: string[], ownId: string): OverlayPlacement[] {
  let value: unknown;
  try { value = JSON.parse(raw ?? 'null'); } catch { throw new Error('Align every partner card before offering the word.'); }
  const partners = memberIds.filter((id) => id !== ownId);
  if (!Array.isArray(value) || value.length !== partners.length
    || !partners.every((id) => value.filter((p) => p?.teamId === id).length === 1)
    || !value.every((p) => p && partners.includes(p.teamId) && p.x === 0 && p.y === 0
      && Number.isInteger(p.rotation) && p.rotation % 360 === 0)) {
    throw new Error('Align every partner card before offering the word.');
  }
  return value as OverlayPlacement[];
}

export function cardsAligned(placements: OverlayPlacement[], partnerIds: string[]): boolean {
  try {
    alignmentProof(JSON.stringify(placements), ['own', ...partnerIds], 'own');
    return true;
  } catch { return false; }
}
