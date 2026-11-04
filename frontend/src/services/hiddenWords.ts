export function isHiddenWordField(value: string): boolean {
  return /^[A-Za-z]*$/.test(value);
}

export function countHiddenWordFields(values: readonly string[]): number {
  return new Set(values.filter((value) => value.length > 0 && isHiddenWordField(value))
    .map((value) => value.toLowerCase())).size;
}

export function parseHiddenWords(raw: string): string[] {
  return raw.toLowerCase().trim().split(/[\s,;]+/).filter(Boolean);
}

export function checkHiddenWords(raw: string, expected: unknown): boolean {
  if (!Array.isArray(expected) || expected.length !== 6
    || !expected.every((word) => typeof word === 'string' && /^[a-z]+$/i.test(word))
    || new Set(expected.map((word) => word.toLowerCase())).size !== 6) {
    throw new Error('Hidden-word answer data is incomplete. Ask an organiser to update puzzle 4.');
  }
  const words = parseHiddenWords(raw);
  if (words.length < 4 || words.length > 6 || !words.every((word) => /^[a-z]+$/.test(word))) return false;
  const accepted = new Set(expected.map((word) => word.toLowerCase()));
  return [...new Set(words)].filter((word) => accepted.has(word)).length >= 4;
}
