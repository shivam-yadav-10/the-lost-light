export function checkRiddleAnswers(answers: readonly string[], expected: unknown): boolean[] {
  if (!Array.isArray(expected) || expected.length !== 5 || !expected.every((value) => typeof value === 'string')) {
    throw new Error('Riddle answer data is missing from Firebase. Ask an organiser to update puzzle 5.');
  }
  const compact = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return expected.map((value, index) => typeof answers[index] === 'string' && compact(answers[index]) === compact(value));
}

export function parseRiddleProof(proof: string | undefined): string[] {
  if (!proof) return [];
  try {
    const parsed: unknown = JSON.parse(proof);
    return Array.isArray(parsed) && parsed.length === 5 && parsed.every((value) => typeof value === 'string' && value.length <= 40)
      ? parsed : [];
  } catch (error) {
    if (error instanceof SyntaxError) return [];
    throw error;
  }
}
