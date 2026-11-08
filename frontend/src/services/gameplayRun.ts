export const GAMEPLAY_RUN = 'production-event-2026-11-10-1300-ist-final-2026-11-09';
export const SESSION_CONTENT_PREFIX = 'lostlight.content.v1.';

export function clearSessionContent() {
  try {
    const keys = Array.from({ length: sessionStorage.length }, (_, index) => sessionStorage.key(index));
    for (const key of keys) if (key?.startsWith(SESSION_CONTENT_PREFIX)) sessionStorage.removeItem(key);
  } catch (error) { console.warn('Could not clear session content.', error); }
}

export function resetPreviousRunStorage(local: Storage, session: Storage) {
  for (const storage of [local, session]) {
    if (storage.getItem('lostlight.run') === GAMEPLAY_RUN) continue;
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
    for (const key of keys) {
      if (key?.startsWith('lostlight.')) storage.removeItem(key);
    }
    storage.setItem('lostlight.run', GAMEPLAY_RUN);
  }
}
