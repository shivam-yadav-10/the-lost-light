import { getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

export const GAME_SERVICES_UNAVAILABLE_MESSAGE = 'Game services are not connected yet.';

export class GameServicesUnavailableError extends Error {
  constructor() {
    super(GAME_SERVICES_UNAVAILABLE_MESSAGE);
    this.name = 'GameServicesUnavailableError';
  }
}

const firebaseConfig: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY?.trim() ?? '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim() ?? '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim() ?? '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET?.trim() ?? '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim() ?? '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID?.trim() ?? '',
};

type FirebaseInitializationStatus = 'unconfigured' | 'ready' | 'error';

interface FirebaseRuntime {
  status: FirebaseInitializationStatus;
  app: FirebaseApp | null;
  auth: Auth | null;
  firestore: Firestore | null;
}

function initializeFirebase(): FirebaseRuntime {
  const isConfigured = Object.values(firebaseConfig).every((value) => value.length > 0);
  if (!isConfigured) return { status: 'unconfigured', app: null, auth: null, firestore: null };

  try {
    const app = getApps().find((existingApp) => existingApp.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
    return {
      status: 'ready',
      app,
      auth: getAuth(app),
      firestore: getFirestore(app),
    };
  } catch {
    return { status: 'error', app: null, auth: null, firestore: null };
  }
}

const firebaseRuntime = initializeFirebase();

export const firebaseInitializationStatus = firebaseRuntime.status;
export const firebaseApp = firebaseRuntime.app;
export const firebaseAuth = firebaseRuntime.auth;
export const firestore = firebaseRuntime.firestore;

export function requireFirebaseServices(): { auth: Auth; firestore: Firestore } {
  if (!firebaseAuth || !firestore) throw new GameServicesUnavailableError();
  return { auth: firebaseAuth, firestore };
}

export function firebaseOperationNotReady(): never {
  throw new GameServicesUnavailableError();
}
