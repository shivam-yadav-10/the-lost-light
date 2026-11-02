import { signInAnonymously, type UserCredential } from 'firebase/auth';
import { firebaseOperationNotReady, requireFirebaseServices } from './firebase';

export async function signInPlayerAnonymously(): Promise<UserCredential> {
  const { auth } = requireFirebaseServices();
  try {
    return await signInAnonymously(auth);
  } catch {
    firebaseOperationNotReady();
  }
}
