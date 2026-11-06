import { getDoc, type DocumentData, type DocumentReference, type DocumentSnapshot, type Firestore } from 'firebase/firestore';

const CONTENT_TTL_MS = 5 * 60_000;
interface Entry {
  expiresAt: number;
  pending: Promise<DocumentSnapshot<DocumentData>>;
}
let caches = new WeakMap<Firestore, Map<string, Entry>>();

export function clearStableContent() {
  caches = new WeakMap();
}

/** Only provisioned text and rewards are cached, never team identity or mutable progress. */
export function readStableContent(reference: DocumentReference<DocumentData>): Promise<DocumentSnapshot<DocumentData>> {
  if (!/^teamPuzzleContent\/[^/]+$/.test(reference.path)
    && !/^teams\/[^/]+\/puzzle(?:Hints|Rewards)\/[^/]+$/.test(reference.path)) {
    throw new Error('Only provisioned puzzle content, hints and rewards may be cached.');
  }
  let cache = caches.get(reference.firestore);
  if (!cache) { cache = new Map(); caches.set(reference.firestore, cache); }
  const existing = cache.get(reference.path);
  if (existing && existing.expiresAt > Date.now()) return existing.pending;
  const entries = cache;
  const entry: Entry = {
    expiresAt: Infinity,
    pending: getDoc(reference).then((snapshot) => {
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
