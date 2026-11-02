import { firebaseOperationNotReady, requireFirebaseServices } from './firebase';

export interface PuzzleRecord {
  puzzleId: string;
  title: string;
  kind: 'core' | 'convergence' | 'vault';
}

export async function getPuzzle(puzzleId: string): Promise<PuzzleRecord> {
  requireFirebaseServices();
  if (!puzzleId.trim()) firebaseOperationNotReady();
  return firebaseOperationNotReady();
}

export async function submitPuzzleAnswer(teamId: string, puzzleId: string, answer: string): Promise<void> {
  requireFirebaseServices();
  if (!teamId.trim() || !puzzleId.trim() || !answer.trim()) firebaseOperationNotReady();
  // Answer validation must remain in a trusted service; it cannot safely run against client-readable data.
  firebaseOperationNotReady();
}

export async function requestPuzzleHint(teamId: string, puzzleId: string): Promise<void> {
  requireFirebaseServices();
  if (!teamId.trim() || !puzzleId.trim()) firebaseOperationNotReady();
  firebaseOperationNotReady();
}
