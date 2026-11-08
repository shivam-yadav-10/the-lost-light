export interface ProgressUpdate {
  teamDocId: string;
  team?: Record<string, unknown>;
  puzzle?: { id: number; progress: Record<string, unknown>; reward?: Record<string, unknown> };
  metadata?: { id: number; data: Record<string, unknown> };
  config?: Record<string, unknown>;
  checkpoint?: { id: string; data: Record<string, unknown> };
  hintCounts?: Array<{ id: number; hintsUsed: number }>;
}

export function publishProgressUpdate(update: ProgressUpdate) {
  window.dispatchEvent(new CustomEvent<ProgressUpdate>('lostlight:progress-confirmed', { detail: update }));
}
