import type {
  CheckpointResult,
  ConvergenceState,
  HintResult,
  PuzzleDetail,
  SealResult,
  SubmitResult,
} from './types';

// Empty by default so the Vite dev proxy handles /api. Set VITE_API_BASE for GitHub Pages builds.
const API_BASE = import.meta.env.VITE_API_BASE ?? '';
const REQUEST_TIMEOUT_MS = 10_000;
const GAME_SERVICES_UNAVAILABLE = 'Game services are not connected yet.';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  gameKey?: string | null;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  if (!import.meta.env.DEV && !API_BASE) {
    throw new ApiError(503, GAME_SERVICES_UNAVAILABLE);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.gameKey) headers['X-Game-Key'] = opts.gameKey;

  try {
    const res = await fetch(`${API_BASE}/api${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string } & T;
    if (!res.ok) throw new ApiError(res.status, data.error ?? 'Something went wrong in the dark.');
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError(0, 'The connection timed out.');
    }
    throw new ApiError(0, 'Cannot reach the game server.');
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  status: () => request<{ name: string; serverTime: string; eventDate: string }>('/game/status'),
  puzzle: (gameKey: string, id: number) => request<PuzzleDetail>(`/puzzles/${id}`, { gameKey }),
  submit: (gameKey: string, id: number, answer: string, proof?: string) =>
    request<SubmitResult>(`/puzzles/${id}/submit`, { method: 'POST', body: { answer, proof }, gameKey }),
  hint: (gameKey: string, id: number) =>
    request<HintResult>(`/puzzles/${id}/hint`, { method: 'POST', gameKey }),
  checkpoint: (gameKey: string, code: string) =>
    request<CheckpointResult>(`/checkpoints/${encodeURIComponent(code)}`, { method: 'POST', gameKey }),
  convergence: (gameKey: string) => request<ConvergenceState>('/convergence', { gameKey }),
  verifySeal: (gameKey: string, seal: string) =>
    request<SealResult>('/convergence/verify', { method: 'POST', body: { seal }, gameKey }),
};
