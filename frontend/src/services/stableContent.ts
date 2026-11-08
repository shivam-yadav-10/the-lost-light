import { type DocumentData, type DocumentReference, type Firestore } from 'firebase/firestore';
import { readDocument } from './firestoreReads';
import { clearSessionContent, loadSessionContent, saveSessionContent } from './sessionContent';

const CONTENT_TTL_MS = 5 * 60_000;
interface Entry {
  expiresAt: number;
  pending: Promise<ContentSnapshot>;
}
export interface ContentSnapshot {
  id: string;
  exists: () => boolean;
  data: () => DocumentData | undefined;
  get: (field: string) => unknown;
}
let caches = new WeakMap<Firestore, Map<string, Entry>>();
let contentVersion = 0;

export function stableContentVersion() { return contentVersion; }

export function rememberRevealedHint(reference: DocumentReference<DocumentData>, data: DocumentData, version: number) {
  if (!/^teams\/[^/]+\/puzzleHints\/[1-8]_[1-3]$/.test(reference.path)) {
    throw new Error('Only a confirmed purchased hint may be remembered.');
  }
  if (version === contentVersion) saveSessionContent(reference, data);
}

export function clearStableContent(clearSession = true) {
  caches = new WeakMap();
  contentVersion++;
  if (clearSession) clearSessionContent();
}

/** Provisioned content and public metadata only; actions validate live state separately. */
export function readStableContent(reference: DocumentReference<DocumentData>, teamDocId?: string): Promise<ContentSnapshot> {
  if (!/^teamPuzzleContent\/[^/]+$/.test(reference.path)
    && !/^teams\/[^/]+\/puzzle(?:Hints|Rewards)\/[^/]+$/.test(reference.path)
    && !/^puzzles\/[1-8]$/.test(reference.path)) {
    throw new Error('Only provisioned puzzle content, public metadata, hints and rewards may be cached.');
  }
  let cache = caches.get(reference.firestore);
  if (!cache) { cache = new Map(); caches.set(reference.firestore, cache); }
  const key = JSON.stringify([teamDocId ?? '', reference.path]);
  const existing = cache.get(key);
  if (existing && existing.expiresAt > Date.now()) return existing.pending;
  const restored = loadSessionContent(reference, teamDocId);
  if (restored) {
    const pending = Promise.resolve({
      id: reference.id, exists: () => true, data: () => restored, get: (field: string) => restored[field],
    });
    cache.set(key, { expiresAt: Date.now() + CONTENT_TTL_MS, pending });
    return pending;
  }
  const entries = cache;
  const entry: Entry = {
    expiresAt: Infinity,
    pending: readDocument(reference).then((snapshot) => {
      if (!snapshot.exists()) {
        if (entries.get(key) === entry) entries.delete(key);
      } else {
        entry.expiresAt = Date.now() + CONTENT_TTL_MS;
        if (caches.get(reference.firestore) === entries && entries.get(key) === entry) {
          saveSessionContent(reference, snapshot.data(), teamDocId);
        }
      }
      return snapshot;
    }).catch((error: unknown) => {
      if (entries.get(key) === entry) entries.delete(key);
      throw error;
    }),
  };
  entries.set(key, entry);
  return entry.pending;
}
