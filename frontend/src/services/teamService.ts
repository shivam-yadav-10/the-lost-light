import { FirebaseError } from 'firebase/app';
import { doc, getDoc, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore';
import { initializeSession } from './authService';
import { hashText } from './gameCrypto';
import { GameServicesUnavailableError, requireFirebaseServices } from './firebase';
import { publishProgressUpdate } from './progressUpdates';

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

/** Up to this many browsers/devices may be signed in to the same team at once. */
export const MAX_DEVICES_PER_TEAM = 3;

const INVALID_KEY_MESSAGE = 'That key does not open any door.';
const DEVICE_LIMIT_MESSAGE = `This team already has ${MAX_DEVICES_PER_TEAM} devices linked. Ask an organiser to free a slot.`;

interface TeamKeyClaim {
  teamId: string;
  teamNumber: number;
  teamName: string;
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
    record.active !== true
  ) {
    throw new GameServicesUnavailableError();
  }
  return {
    teamId: record.teamId,
    teamNumber: record.teamNumber,
    teamName: record.teamName,
  };
}

function assignedDeviceIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

export async function validateTeamGameKey(rawGameKey: string): Promise<TeamIdentity> {
  const gameKey = rawGameKey.trim().toUpperCase();
  if (!gameKey || gameKey.length > 64) throw new TeamLoginError(INVALID_KEY_MESSAGE);

  const { firestore } = requireFirebaseServices();
  const user = await initializeSession();
  try {
    const keyHash = await hashText(gameKey);
    const claimSnapshot = await getDoc(doc(firestore, 'teamKeyClaims', keyHash));
    if (!claimSnapshot.exists()) throw new TeamLoginError(INVALID_KEY_MESSAGE);
    const claim = parseClaim(claimSnapshot.data());

    const teamRef = doc(firestore, 'teams', claim.teamId);
    const introSeen = await runTransaction(firestore, async (transaction) => {
      const teamSnapshot = await transaction.get(teamRef);
      if (!teamSnapshot.exists()) throw new GameServicesUnavailableError();
      const teamData = teamSnapshot.data();
      if (
        teamData.active !== true ||
        teamData.teamNumber !== claim.teamNumber ||
        teamData.teamName !== claim.teamName
      ) {
        throw new GameServicesUnavailableError();
      }

      const devices = assignedDeviceIds(teamData.assignedUids);
      if (devices.includes(user.uid)) {
        transaction.update(teamRef, { lastSeenAt: serverTimestamp() });
      } else {
        if (devices.length >= MAX_DEVICES_PER_TEAM) throw new TeamLoginError(DEVICE_LIMIT_MESSAGE);
        transaction.update(teamRef, {
          assignedUids: [...devices, user.uid],
          lastSeenAt: serverTimestamp(),
        });
      }
      return teamData.introSeenAt != null;
    });

    return {
      teamId: claim.teamId,
      teamNumber: claim.teamNumber,
      teamName: claim.teamName,
      introSeen,
    };
  } catch (error) {
    if (error instanceof TeamLoginError || error instanceof GameServicesUnavailableError) throw error;
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
    if (!teamSnapshot.exists() || !assignedDeviceIds(teamSnapshot.get('assignedUids')).includes(user.uid)) {
      throw new TeamLoginError('This team is no longer linked to this device.');
    }
    if (teamSnapshot.get('introSeenAt') == null) {
      await updateDoc(teamRef, { introSeenAt: serverTimestamp() });
    }
    const saved = teamSnapshot.get('introSeenAt') != null ? teamSnapshot : await getDoc(teamRef);
    if (saved.get('introSeenAt') == null) throw new GameServicesUnavailableError();
    publishProgressUpdate({ teamDocId, team: { introSeenAt: saved.get('introSeenAt') } });
  } catch (error) {
    if (error instanceof TeamLoginError) throw error;
    if (error instanceof FirebaseError) throw new GameServicesUnavailableError();
    throw error;
  }
}
