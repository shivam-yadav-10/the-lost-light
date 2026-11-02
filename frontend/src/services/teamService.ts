import { firebaseOperationNotReady, requireFirebaseServices } from './firebase';

export interface TeamIdentity {
  teamId: string;
  teamName: string;
}

export async function validateTeamGameKey(gameKey: string): Promise<TeamIdentity> {
  requireFirebaseServices();
  if (!gameKey.trim() || gameKey.length > 64) firebaseOperationNotReady();

  // Do not read game keys from client-readable team documents. A trusted validation path is still needed.
  return firebaseOperationNotReady();
}
