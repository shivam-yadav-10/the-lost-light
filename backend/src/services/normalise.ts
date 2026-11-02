/** Lower-case, trim, collapse whitespace, strip punctuation so "Six!" === "six". */
export function normaliseAnswer(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}
