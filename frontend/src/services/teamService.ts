import { FirebaseError } from 'firebase/app';
import { doc, getDoc, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { initializeSession } from './authService';
import { hashText } from './gameCrypto';
import { GameServicesUnavailableError, requireFirebaseServices } from './firebase';

export interface TeamIdentity {
  teamId: string;
  teamNumber: number;
  teamName: string;
  introSeen: boolean;
}

export class TeamLoginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TeamLoginError';
  }
}

const INVALID_KEY_MESSAGE = 'That key does not open any door.';

interface TeamKeyClaim {
  teamId: string;
  teamNumber: number;
  teamName: string;
  active: boolean;
  assignedUid: string | null;
}

function parseClaim(value: unknown): TeamKeyClaim {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new GameServicesUnavailableError();
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.teamId !== 'string' ||
    !record.teamId ||
    typeof record.teamNumber !== 'number' ||
    !Number.isInteger(record.teamNumber) ||
    record.teamNumber < 1 ||
    typeof record.teamName !== 'string' ||
    !record.teamName.trim() ||
    record.active !== true ||
    (record.assignedUid != null && typeof record.assignedUid !== 'string')
  ) {
    throw new GameServicesUnavailableError();
  }
  return {
    teamId: record.teamId,
    teamNumber: record.teamNumber,
    teamName: record.teamName,
    active: true,
    assignedUid: typeof record.assignedUid === 'string' ? record.assignedUid : null,
  };
}

export async function validateTeamGameKey(rawGameKey: string): Promise<TeamIdentity> {
  const gameKey = rawGameKey.trim().toUpperCase();
  if (!gameKey || gameKey.length > 64) throw new TeamLoginError(INVALID_KEY_MESSAGE);

  const { firestore } = requireFirebaseServices();
  const user = await initializeSession();
  try {
    const keyHash = await hashText(gameKey);
    const claimRef = doc(firestore, 'teamKeyClaims', keyHash);
    const claimSnapshot = await getDoc(claimRef);
    if (!claimSnapshot.exists()) throw new TeamLoginError(INVALID_KEY_MESSAGE);

    const claim = parseClaim(claimSnapshot.data());
    if (claim.assignedUid && claim.assignedUid !== user.uid) {
      throw new TeamLoginError('This team is already linked to another device.');
    }

    const teamRef = doc(firestore, 'teams', claim.teamId);
    if (!claim.assignedUid) {
      const batch = writeBatch(firestore);
      batch.update(claimRef, { assignedUid: user.uid });
      batch.update(teamRef, {
        assignedUid: user.uid,
        lastSeenAt: serverTimestamp(),
      });
      await batch.commit();
    }

    const teamSnapshot = await getDoc(teamRef);
    if (!teamSnapshot.exists()) throw new GameServicesUnavailableError();
    const teamData = teamSnapshot.data();
    if (
      teamData.assignedUid !== user.uid ||
      teamData.active !== true ||
      teamData.teamNumber !== claim.teamNumber ||
      teamData.teamName !== claim.teamName
    ) {
      throw new TeamLoginError('This team is already linked to another device.');
    }

    return {
      teamId: claim.teamId,
      teamNumber: claim.teamNumber,
      teamName: claim.teamName,
      introSeen: teamData.introSeenAt != null,
    };
  } catch (error) {
    if (error instanceof TeamLoginError || error instanceof GameServicesUnavailableError) throw error;
    if (error instanceof FirebaseError && error.code === 'permission-denied') {
      const claimSnapshot = await getDoc(doc(firestore, 'teamKeyClaims', await hashText(gameKey)));
      if (claimSnapshot.exists() && claimSnapshot.get('assignedUid') !== user.uid) {
        throw new TeamLoginError('This team is already linked to another device.');
      }
    }
    if (error instanceof FirebaseError) throw new GameServicesUnavailableError();
    throw error;
  }
}

export async function markTeamIntroSeen(teamDocId: string): Promise<void> {
  if (!teamDocId.trim()) throw new GameServicesUnavailableError();
  const { firestore } = requireFirebaseServices();
  const user = await initializeSession();
  const teamRef = doc(firestore, 'teams', teamDocId);
  try {
    const teamSnapshot = await getDoc(teamRef);
    if (!teamSnapshot.exists() || teamSnapshot.get('assignedUid') !== user.uid) {
      throw new TeamLoginError('This team is no longer linked to this device.');
    }
    if (teamSnapshot.get('introSeenAt') == null) {
      await updateDoc(teamRef, { introSeenAt: serverTimestamp() });
    }
  } catch (error) {
    if (error instanceof TeamLoginError) throw error;
    if (error instanceof FirebaseError) throw new GameServicesUnavailableError();
    throw error;
  }
}
