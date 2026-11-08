import { getDoc, getDocs, getDocFromServer, type DocumentData, type DocumentReference, type Query } from 'firebase/firestore';

const counts = { documentReads: 0, queries: 0, transactionReads: 0 };
export function recordTransactionRead() { if (import.meta.env.DEV) counts.transactionReads++; }
export function readDocument(reference: DocumentReference<DocumentData>) {
  if (import.meta.env.DEV) counts.documentReads++;
  return getDoc(reference);
}
export function readQuery(query: Query<DocumentData>) {
  if (import.meta.env.DEV) counts.queries++;
  return getDocs(query);
}
export function readServerDocument(reference: DocumentReference<DocumentData>) {
  if (import.meta.env.DEV) counts.documentReads++;
  return getDocFromServer(reference);
}
if (import.meta.env.DEV) {
  Object.defineProperty(window, 'lostlightReadCounts', {
    configurable: true,
    value: { snapshot: () => ({ ...counts }), reset: () => {
      counts.documentReads = 0; counts.queries = 0; counts.transactionReads = 0;
    } },
  });
}
