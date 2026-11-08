import { Timestamp, type DocumentData, type DocumentReference } from 'firebase/firestore';
import { GAMEPLAY_RUN, SESSION_CONTENT_PREFIX } from './gameplayRun';
export { clearSessionContent } from './gameplayRun';

type StoredValue = null | boolean | number | string
  | { type: 'timestamp'; seconds: number; nanoseconds: number }
  | { type: 'array'; values: StoredValue[] }
  | { type: 'object'; entries: Array<[string, StoredValue]> };

function encode(value: unknown): StoredValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Timestamp) return { type: 'timestamp', seconds: value.seconds, nanoseconds: value.nanoseconds };
  if (Array.isArray(value)) return { type: 'array', values: value.map(encode) };
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return { type: 'object', entries: Object.entries(value).map(([key, item]) => [key, encode(item)]) };
  }
  throw new Error('Unsupported data in the session content cache.');
}

function decode(value: unknown): unknown {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (!value || typeof value !== 'object') throw new Error('Invalid session content cache.');
  if ('type' in value && value.type === 'timestamp' && 'seconds' in value && 'nanoseconds' in value
    && typeof value.seconds === 'number' && typeof value.nanoseconds === 'number') {
    return new Timestamp(value.seconds, value.nanoseconds);
  }
  if ('type' in value && value.type === 'array' && 'values' in value && Array.isArray(value.values)) {
    return value.values.map(decode);
  }
  if ('type' in value && value.type === 'object' && 'entries' in value && Array.isArray(value.entries)
    && value.entries.every((entry) => Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string')) {
    return Object.fromEntries(value.entries.map(([key, item]) => [key, decode(item)]));
  }
  throw new Error('Invalid session content cache.');
}

function cacheKey(reference: DocumentReference<DocumentData>, teamDocId?: string): string | null {
  const rewardTeam = /^teams\/([^/]+)\/puzzleRewards\/[1-8]$/.exec(reference.path)?.[1];
  const team = rewardTeam ?? (/^puzzles\/[1-8]$/.test(reference.path) ? teamDocId : undefined);
  const project = reference.firestore.app.options.projectId;
  return team && project ? SESSION_CONTENT_PREFIX + JSON.stringify([project, GAMEPLAY_RUN, team, reference.path]) : null;
}

export function loadSessionContent(reference: DocumentReference<DocumentData>, teamDocId?: string): DocumentData | null {
  const key = cacheKey(reference, teamDocId);
  if (!key) return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (raw === null) return null;
    const data = decode(JSON.parse(raw));
    if (!data || typeof data !== 'object' || Array.isArray(data) || data instanceof Timestamp) {
      throw new Error('Invalid cached document.');
    }
    return data;
  } catch (error) {
    console.warn('Could not restore session content; fetching it from Firebase instead.', error);
    try { sessionStorage.removeItem(key); }
    catch (storageError) { console.warn('Could not discard invalid session content.', storageError); }
    return null;
  }
}

export function saveSessionContent(reference: DocumentReference<DocumentData>, data: DocumentData, teamDocId?: string) {
  const key = cacheKey(reference, teamDocId);
  if (!key) return;
  try { sessionStorage.setItem(key, JSON.stringify(encode(data))); }
  catch (error) { console.warn('Could not cache session content; the current page can still use it.', error); }
}
