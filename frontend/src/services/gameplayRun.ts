export const GAMEPLAY_RUN = 'production-event-2026-11-10-1300-ist';

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
