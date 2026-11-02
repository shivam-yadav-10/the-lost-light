import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/manrope';
import { App } from './App';
import { observeAuthState } from './services/authService';
import { firebaseInitializationStatus } from './services/firebase';
import './index.css';

observeAuthState(() => undefined);
if (import.meta.env.DEV) {
  console.info(
    firebaseInitializationStatus === 'ready'
      ? '[Firebase diagnostic] Firebase initialized.'
      : firebaseInitializationStatus === 'unconfigured'
        ? '[Firebase diagnostic] Firebase is not configured.'
        : '[Firebase diagnostic] Firebase initialization is unavailable.',
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
