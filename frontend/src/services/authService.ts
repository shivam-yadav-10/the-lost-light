import {
  onAuthStateChanged,
  signInAnonymously,
  signOut,
  type Unsubscribe,
  type User,
} from 'firebase/auth';
import { firebaseAuth, requireFirebaseServices } from './firebase';

let observedUser: User | null = null;
let authStateInitialized = false;
let resolveAuthState: (() => void) | null = null;
const authStateReady = new Promise<void>((resolve) => {
  resolveAuthState = resolve;
});
let stopAuthStateObserver: Unsubscribe | null = null;
let pendingSignIn: Promise<User> | null = null;

function ensureAuthStateObserver(): void {
  if (stopAuthStateObserver || !firebaseAuth) return;

  stopAuthStateObserver = onAuthStateChanged(firebaseAuth, (user) => {
    observedUser = user;
    if (!authStateInitialized) {
      authStateInitialized = true;
      resolveAuthState?.();
      resolveAuthState = null;
    }
  });
}

export async function getCurrentUser(): Promise<User | null> {
  requireFirebaseServices();
  ensureAuthStateObserver();
  await authStateReady;
  return observedUser;
}

export async function getCurrentUid(): Promise<string | null> {
  const user = await getCurrentUser();
  return user?.uid ?? null;
}

export async function initializeSession(): Promise<User> {
  const { auth } = requireFirebaseServices();
  ensureAuthStateObserver();
  await authStateReady;

  if (observedUser) return observedUser;
  if (pendingSignIn) return pendingSignIn;

  pendingSignIn = signInAnonymously(auth)
    .then(({ user }) => {
      observedUser = user;
      return user;
    })
    .finally(() => {
      pendingSignIn = null;
    });

  return pendingSignIn;
}

export async function logout(): Promise<void> {
  const { auth } = requireFirebaseServices();
  await signOut(auth);
  observedUser = null;
}
