export function checkConvergenceAnswer(raw: string, expected: unknown, overlayWord: unknown): boolean {
  if (typeof expected !== 'string' || !/^[a-z]{5}$/i.test(expected)
    || typeof overlayWord !== 'string' || !/^[a-z]{5}$/i.test(overlayWord)) {
    throw new Error('Your circle word is missing. Ask a Keeper to provision Convergence.');
  }
  const words = raw.trim().toLowerCase().split(/\s+/);
  return words.length === 2 && words.includes(expected.toLowerCase()) && words.includes(overlayWord.toLowerCase())
    && new Set(words).size === 2;
}
