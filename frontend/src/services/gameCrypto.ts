export function normalizeAnswer(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function compactAnswer(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function normalizeSeal(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export async function hashText(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('Secure browser cryptography is unavailable.');

  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
