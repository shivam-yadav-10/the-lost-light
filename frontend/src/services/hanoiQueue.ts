import { hanoiPegs } from './hanoi';
import { loadHanoiProgress, parseHanoiDraft, saveHanoiProgress, type HanoiDraft } from './hanoiProgress';

interface QueueData {
  draft: HanoiDraft;
  pending: string[];
}

export interface HanoiQueueState {
  moves: string;
  pending: number;
  syncing: boolean;
  syncError: string | null;
  storageError: string | null;
}

export class HanoiQueue {
  private data: QueueData;
  private listeners = new Set<(state: HanoiQueueState) => void>();
  private inFlight: Promise<void> | null = null;
  private state: HanoiQueueState;

  private constructor(private teamId: string, data: QueueData) {
    this.data = data;
    this.state = {
      moves: data.pending.reduce((moves, operation) => operation === '' ? '' : moves + operation, data.draft.moves),
      pending: data.pending.length, syncing: false, syncError: null, storageError: null,
    };
  }

  static async restore(teamId: string, initialDraft?: HanoiDraft): Promise<HanoiQueue> {
    const raw = sessionStorage.getItem(HanoiQueue.key(teamId));
    let data: QueueData;
    if (raw !== null) {
      const value: unknown = JSON.parse(raw);
      if (!value || typeof value !== 'object' || !('draft' in value)
        || !('pending' in value) || !Array.isArray(value.pending)) {
        throw new Error('The local tower queue is invalid. It has not been overwritten.');
      }
      const draft = parseHanoiDraft(value.draft);
      let previous = draft.moves;
      const pending: string[] = [];
      for (const operation of value.pending) {
        if (typeof operation !== 'string' || (operation !== '' && !/^[0-2]{2}$/.test(operation))) {
          throw new Error('The local tower queue is invalid.');
        }
        const moves = operation === '' ? '' : previous + operation;
        HanoiQueue.validateMove(previous, moves);
        pending.push(operation);
        previous = moves;
      }
      data = { draft, pending };
    } else {
      data = { draft: initialDraft ? parseHanoiDraft(initialDraft) : await loadHanoiProgress(teamId), pending: [] };
    }
    const queue = new HanoiQueue(teamId, data);
    queue.persist(data);
    return queue;
  }

  private static key(teamId: string) { return `lostlight.hanoi.${teamId}`; }

  private static validateMove(previous: string, moves: string) {
    hanoiPegs(moves);
    if (moves !== '' && (moves.length !== previous.length + 2 || !moves.startsWith(previous))) {
      throw new Error('Queue one legal move at a time, or restart the tower.');
    }
  }

  private publish(update: Partial<HanoiQueueState>) {
    this.state = { ...this.state, ...update };
    this.listeners.forEach((listener) => listener(this.state));
  }

  private persist(data: QueueData) {
    try {
      sessionStorage.setItem(HanoiQueue.key(this.teamId), JSON.stringify(data));
    } catch {
      const message = 'Cannot save the tower in this tab. Allow session storage before continuing; your last queued tower has not changed.';
      this.publish({ storageError: message });
      throw new Error(message);
    }
  }

  subscribe(listener: (state: HanoiQueueState) => void) {
    this.listeners.add(listener);
    listener(this.state);
    return () => { this.listeners.delete(listener); };
  }

  enqueue(moves: string) {
    HanoiQueue.validateMove(this.state.moves, moves);
    const next = { ...this.data, pending: [...this.data.pending, moves === '' ? '' : moves.slice(-2)] };
    this.persist(next);
    this.data = next;
    this.publish({ moves, pending: next.pending.length, storageError: null });
  }

  retryStorage() {
    this.persist(this.data);
    this.publish({ storageError: null });
  }

  flush(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    if (!this.data.pending.length) return Promise.resolve();
    const count = this.data.pending.length;
    const moves = this.state.moves;
    this.publish({ syncing: true });
    this.inFlight = (async () => {
      try {
        const draft = await saveHanoiProgress(this.teamId, moves);
        const next = { draft, pending: this.data.pending.slice(count) };
        this.persist(next);
        this.data = next;
        this.publish({ pending: next.pending.length, syncError: null, storageError: null });
      } catch (error) {
        console.error('Vault tower submission sync failed; the session queue is retained for retry.', error);
        this.publish({ syncError: error instanceof Error ? error.message : 'Tower sync failed. Your moves remain queued in this tab.' });
        throw error;
      } finally {
        this.inFlight = null;
        this.publish({ syncing: false });
      }
    })();
    return this.inFlight;
  }

  async finishSync() {
    while (this.data.pending.length || this.inFlight) await this.flush();
  }

  clear() {
    sessionStorage.removeItem(HanoiQueue.key(this.teamId));
    queues.delete(this.teamId);
  }
}

const queues = new Map<string, Promise<HanoiQueue>>();

export function getHanoiQueue(teamId: string, initialDraft?: HanoiDraft): Promise<HanoiQueue> {
  let queue = queues.get(teamId);
  if (!queue) {
    queue = HanoiQueue.restore(teamId, initialDraft).catch((error) => { queues.delete(teamId); throw error; });
    queues.set(teamId, queue);
  }
  return queue;
}
