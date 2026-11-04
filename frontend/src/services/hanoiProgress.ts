import { doc, getDocFromServer, runTransaction, serverTimestamp } from 'firebase/firestore';
import { initializeSession } from './authService';
import { requireFirebaseServices } from './firebase';
import { HANOI_DISKS, hanoiPegs } from './hanoi';

export interface HanoiDraft {
  version: 1;
  disks: number;
  revision: number;
  moves: string;
}

export function parseHanoiDraft(value: unknown): HanoiDraft {
  if (value === undefined) return { version: 1, disks: HANOI_DISKS, revision: 0, moves: '' };
  if (!value || typeof value !== 'object'
    || !('version' in value) || value.version !== 1
    || !('disks' in value) || value.disks !== HANOI_DISKS
    || !('revision' in value) || typeof value.revision !== 'number'
    || !Number.isSafeInteger(value.revision) || value.revision < 0
    || !('moves' in value) || typeof value.moves !== 'string') {
    throw new Error('Your saved tower data is invalid. Ask a Keeper for help; it has not been overwritten.');
  }
  hanoiPegs(value.moves);
  return { version: 1, disks: HANOI_DISKS, revision: value.revision, moves: value.moves };
}

function reference(teamId: string) {
  if (!teamId.trim()) throw new Error('A team is required to save the tower.');
  const { firestore } = requireFirebaseServices();
  return doc(firestore, 'teams', teamId, 'progress', '8');
}

export async function loadHanoiProgress(teamId: string): Promise<HanoiDraft> {
  await initializeSession();
  const snapshot = await getDocFromServer(reference(teamId));
  if (snapshot.get('status') === 'solved') throw new Error('This Vault is already open. Reload the page.');
  return parseHanoiDraft(snapshot.get('hanoiDraft'));
}

export async function saveHanoiProgress(teamId: string, moves: string): Promise<HanoiDraft> {
  hanoiPegs(moves);
  await initializeSession();
  const progressRef = reference(teamId);
  const { firestore } = requireFirebaseServices();
  return runTransaction(firestore, async (transaction) => {
    const snapshot = await transaction.get(progressRef);
    if (snapshot.get('status') === 'solved') throw new Error('This Vault is already open. Reload the page.');
    const current = parseHanoiDraft(snapshot.get('hanoiDraft'));
    const draft: HanoiDraft = { version: 1, disks: HANOI_DISKS, revision: current.revision + 1, moves };
    const now = serverTimestamp();
    transaction.set(progressRef, {
      ...(!snapshot.exists() ? { status: 'in_progress', hintsUsed: 0, startedAt: now } : {}),
      hanoiDraft: draft,
      hanoiSavedAt: now,
    }, { merge: true });
    return draft;
  });
}
