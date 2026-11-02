import { firebaseOperationNotReady, requireFirebaseServices } from './firebase';

export interface GameConfig {
  name: string;
  eventDate: string;
}

export interface TeamProgress {
  puzzleId: string;
  status: 'in_progress' | 'solved';
  hintsUsed: number;
  solvedAt: string | null;
}

export async function getGameConfig(): Promise<GameConfig> {
  requireFirebaseServices();
  return firebaseOperationNotReady();
}

export async function getTeamProgress(teamId: string): Promise<TeamProgress[]> {
  requireFirebaseServices();
  if (!teamId.trim()) firebaseOperationNotReady();
  return firebaseOperationNotReady();
}

export async function recordIntroSeen(teamId: string): Promise<void> {
  requireFirebaseServices();
  if (!teamId.trim()) firebaseOperationNotReady();
  firebaseOperationNotReady();
}

export async function redeemCheckpoint(teamId: string, code: string): Promise<void> {
  requireFirebaseServices();
  if (!teamId.trim() || !code.trim()) firebaseOperationNotReady();
  firebaseOperationNotReady();
}
