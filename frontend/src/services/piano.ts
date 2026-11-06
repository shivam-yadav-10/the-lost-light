export const PIANO_KEYS = ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'] as const;
export type PianoKey = typeof PIANO_KEYS[number];
export const PIANO_VERSION = 1;
export const PIANO_FREQUENCIES = [261.63, 293.66, 329.63, 349.23, 392, 440, 493.88, 523.25, 587.33];

export function teamMelody(teamId: string): PianoKey[] {
  if (!teamId.trim()) throw new Error('A team identity is required for the melody.');
  const final = /^TEAM-(\d{3})$/.exec(teamId);
  const test = /^LOCAL-TEST-([1-4])$/.exec(teamId);
  let seed = 2166136261;
  for (const char of teamId) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  const identity = final ? Number(final[1]) - 1 : test ? 12 + Number(test[1]) - 1 : seed % 81;
  const melody: PianoKey[] = [PIANO_KEYS[Math.floor(identity / 9) % 9], PIANO_KEYS[identity % 9]];
  for (let note = 0; note < 6; note++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    melody.push(PIANO_KEYS[seed % PIANO_KEYS.length]);
  }
  return melody;
}

export function matchesMelody(teamId: string, value: unknown): boolean {
  const expected = teamMelody(teamId);
  return Array.isArray(value) && value.length === expected.length
    && value.every((key, index) => key === expected[index]);
}

export function pianoUnlocked(progress: Record<string, unknown>): boolean {
  return progress.status === 'solved' || progress.pianoVersion === PIANO_VERSION;
}
