import { FirebaseError } from 'firebase/app';
import { collection, getDocs, query, runTransaction, serverTimestamp, where } from 'firebase/firestore';
import { initializeSession } from './authService';
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

async function hashGameKey(gameKey: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new GameServicesUnavailableError();

  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(gameKey));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function validateTeamGameKey(rawGameKey: string): Promise<TeamIdentity> {
  const gameKey = rawGameKey.trim().toUpperCase();
  if (!gameKey || gameKey.length > 64) throw new TeamLoginError(INVALID_KEY_MESSAGE);

  const { firestore } = requireFirebaseServices();
  const user = await initializeSession();
  const gameKeyHash = await hashGameKey(gameKey);

  let matches;
  try {
    matches = await getDocs(query(collection(firestore, 'teams'), where('gameKeyHash', '==', gameKeyHash)));
  } catch (error) {
    if (error instanceof FirebaseError) throw new GameServicesUnavailableError();
    throw error;
  }

  if (matches.size !== 1) throw new TeamLoginError(INVALID_KEY_MESSAGE);

  const teamRef = matches.docs[0].ref;
  try {
    return await runTransaction(firestore, async (transaction) => {
      const teamSnapshot = await transaction.get(teamRef);
      if (!teamSnapshot.exists()) throw new TeamLoginError(INVALID_KEY_MESSAGE);

      const team = teamSnapshot.data();
      if (
        team.active !== true ||
        team.gameKeyHash !== gameKeyHash ||
        typeof team.teamName !== 'string' ||
        !team.teamName.trim() ||
        !Number.isInteger(team.teamNumber) ||
        team.teamNumber < 1
      ) {
        throw new TeamLoginError(INVALID_KEY_MESSAGE);
      }

      if (team.assignedUid !== null && team.assignedUid !== user.uid) {
        throw new TeamLoginError('This team is already linked to another device.');
      }

      transaction.update(teamRef, {
        assignedUid: user.uid,
        lastSeenAt: serverTimestamp(),
      });

      return {
        teamId: teamSnapshot.id,
        teamNumber: team.teamNumber,
        teamName: team.teamName,
        introSeen: Boolean(team.introSeenAt),
      };
    });
  } catch (error) {
    if (error instanceof TeamLoginError) throw error;
    if (error instanceof FirebaseError) throw new GameServicesUnavailableError();
    throw error;
  }
}
