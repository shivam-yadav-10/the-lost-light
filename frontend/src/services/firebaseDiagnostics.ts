import { FirebaseError } from 'firebase/app';
import { doc, getDoc } from 'firebase/firestore';
import { firebaseInitializationStatus, requireFirebaseServices } from './firebase';

const LOCAL_TEST_TEAM_IDS = ['LOCAL-TEST-1', 'LOCAL-TEST-2', 'LOCAL-TEST-3', 'LOCAL-TEST-4'];

export async function runFirebaseConnectivityDiagnostic(): Promise<void> {
  if (!import.meta.env.DEV) return;

  if (firebaseInitializationStatus !== 'ready') {
    console.info('[Firebase diagnostic] Firebase initialization is unavailable.');
    return;
  }

  console.info('[Firebase diagnostic] Firebase initialized.');

  try {
    const { firestore } = requireFirebaseServices();
    const teams = await Promise.all(
      LOCAL_TEST_TEAM_IDS.map((teamId) => getDoc(doc(firestore, 'teams', teamId))),
    );
    const readableTeams = teams.filter((team) => team.exists()).length;
    console.info(`[Firebase diagnostic] Firestore reachable; ${readableTeams}/4 local test teams are readable.`);
  } catch (error) {
    if (error instanceof FirebaseError && error.code === 'permission-denied') {
      console.info('[Firebase diagnostic] Firestore reachable; rules deny reading local test teams.');
      return;
    }
    console.warn('[Firebase diagnostic] Firestore connectivity check failed.');
  }
}
