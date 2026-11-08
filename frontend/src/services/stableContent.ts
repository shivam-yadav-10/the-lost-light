import { type DocumentData, type DocumentReference, type DocumentSnapshot, type Firestore } from 'firebase/firestore';
import { readDocument } from './firestoreReads';

const CONTENT_TTL_MS = 5 * 60_000;
interface Entry {
  expiresAt: number;
  pending: Promise<DocumentSnapshot<DocumentData>>;
}
let caches = new WeakMap<Firestore, Map<string, Entry>>();

export function clearStableContent() {
  caches = new WeakMap();
}

/** Provisioned content and public metadata only; actions validate live state separately. */
export function readStableContent(reference: DocumentReference<DocumentData>): Promise<DocumentSnapshot<DocumentData>> {
  if (!/^teamPuzzleContent\/[^/]+$/.test(reference.path)
    && !/^teams\/[^/]+\/puzzle(?:Hints|Rewards)\/[^/]+$/.test(reference.path)
    && !/^puzzles\/[1-8]$/.test(reference.path)) {
    throw new Error('Only provisioned puzzle content, public metadata, hints and rewards may be cached.');
  }
  let cache = caches.get(reference.firestore);
  if (!cache) { cache = new Map(); caches.set(reference.firestore, cache); }
  const existing = cache.get(reference.path);
  if (existing && existing.expiresAt > Date.now()) return existing.pending;
  const entries = cache;
  const entry: Entry = {
    expiresAt: Infinity,
    pending: readDocument(reference).then((snapshot) => {
      if (!snapshot.exists()) {
        if (entries.get(reference.path) === entry) entries.delete(reference.path);
      } else entry.expiresAt = Date.now() + CONTENT_TTL_MS;
      return snapshot;
    }).catch((error: unknown) => {
      if (entries.get(reference.path) === entry) entries.delete(reference.path);
      throw error;
    }),
  };
  entries.set(reference.path, entry);
  return entry.pending;
}
