import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  getAdminErrorMessage,
  getAdminOverview,
  getCurrentAdminUid,
  setPuzzleUnlockOverride,
  signInAdmin,
  signOutAdmin,
} from '../services/adminService';
import type { AdminOverview } from '../api/types';
import { EVENT_START_AT, formatDuration } from '../services/gameRules';

const REFRESH_MS = 15_000;

/** Minimal local organiser view. Plain styling on purpose — this is a utility, not part of the game. */
export function AdminPage() {
  const [adminUid, setAdminUid] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getCurrentAdminUid()
      .then((uid) => {
        if (active) setAdminUid(uid);
      })
      .catch((err: unknown) => {
        if (active) setError(getAdminErrorMessage(err));
      })
      .finally(() => {
        if (active) setAuthReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!adminUid) return;
    try {
      setData(await getAdminOverview());
      setError(null);
    } catch (err) {
      setData(null);
      setError(getAdminErrorMessage(err));
    }
  }, [adminUid]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      setAdminUid(await signInAdmin(email, password));
      setPassword('');
    } catch (err) {
      setError(getAdminErrorMessage(err));
    }
  }

  /** Forces a core fragment open now, or re-locks it, overriding the day's release schedule. */
  async function toggleUnlock(puzzleId: number, currentlyLocked: boolean) {
    setTogglingId(puzzleId);
    setToggleError(null);
    try {
      setData(await setPuzzleUnlockOverride(puzzleId, currentlyLocked));
    } catch (err) {
      setToggleError(getAdminErrorMessage(err));
    } finally {
      setTogglingId(null);
    }
  }

  /** Signs out of the dedicated organiser Firebase session. */
  async function lock() {
    try {
      await signOutAdmin();
      setError(null);
    } catch (err) {
      setError(getAdminErrorMessage(err));
    }
    setAdminUid(null);
    setEmail('');
    setPassword('');
    setData(null);
    setToggleError(null);
  }

  if (!authReady) {
    return <main className="mx-auto max-w-sm p-6" aria-live="polite">Checking organiser access…</main>;
  }

  if (!adminUid) {
    return (
      <main className="mx-auto max-w-sm p-6">
        <h1 className="text-2xl">Organiser access</h1>
        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <label htmlFor="adminEmail" className="eyebrow block">
            Organiser email
          </label>
          <input
            id="adminEmail"
            type="email"
            className="input-ember"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
          <label htmlFor="adminPassword" className="eyebrow block">
            Password
          </label>
          <input
            id="adminPassword"
            type="password"
            className="input-ember"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          {error && (
            <p role="alert" className="text-sm text-marigold">
              {error}
            </p>
          )}
          <button type="submit" className="btn-ember">
            Open
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl">The Lost Light — organiser view</h1>
        <div className="flex items-center gap-3 text-xs text-parchment/60">
          {data && <span>Updated {new Date(data.generatedAt).toLocaleTimeString()}</span>}
          <button type="button" className="btn-ghost !py-1 !px-3" onClick={() => void load()}>
            Refresh
          </button>
          <button type="button" className="btn-ember !py-1 !px-4 text-xs" onClick={() => void lock()} aria-label="Lock the organiser view">
            Lock
          </button>
        </div>
      </header>
      {error && (
        <p role="alert" className="mt-3 text-sm text-marigold">
          {error}
        </p>
      )}

      {data && (
        <section className="mt-6" aria-label="Fragment release controls">
          <h2 className="eyebrow">Fragment release</h2>
          {toggleError && (
            <p role="alert" className="mt-1 text-sm text-marigold">
              {toggleError}
            </p>
          )}
          <div className="mt-2 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {data.puzzles
              .filter((p) => p.kind === 'core')
              .map((p) => (
                <div key={p.id} className="rounded-xl border border-ember/20 p-3 text-sm">
                  <div className="text-xs uppercase tracking-wider text-parchment/50">Fragment {p.id}</div>
                  <div className="mt-1 font-medium text-parchment">{p.fragmentName}</div>
                  <div className={`mt-1 text-xs ${p.scheduleLocked ? 'text-parchment/50' : 'text-ember-glow'}`}>
                    {p.scheduleLocked ? `Locked · opens ${fmt(p.unlockAt)} IST` : 'Unlocked'}
                  </div>
                  <button
                    type="button"
                    className="btn-ghost mt-2 w-full !py-1 !px-3 text-xs"
                    disabled={togglingId === p.id}
                    onClick={() => void toggleUnlock(p.id, p.scheduleLocked)}
                  >
                    {togglingId === p.id ? 'Working…' : p.scheduleLocked ? 'Unlock now' : 'Re-lock'}
                  </button>
                </div>
              ))}
          </div>
          <p className="mt-2 text-xs text-parchment/40">
            Overrides the scheduled release time for every team at once, not question prerequisites. Each team must
            solve the preceding question before moving on, including Convergence and the Vault.
          </p>
          <p className="mt-1 text-xs text-parchment/40">
            Ranking time starts at {fmt(EVENT_START_AT)} IST for every team, independent of login. Final elapsed time
            plus cumulative hint penalties decides rank; fewer hints break score ties.
          </p>
        </section>
      )}

      {data && (
        <p className="mt-6 text-sm text-parchment/60">
          Convergence uses named partner circles. Every partner must reach the chamber and exchange
          seals. Legacy Keeper shard seals are no longer used. Never distribute the Vault proof keys below.
        </p>
      )}

      {data && (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[1220px] border-collapse text-sm">
            <caption className="sr-only">Team progress by puzzle</caption>
            <thead>
              <tr className="border-b border-ember/30 text-left text-xs uppercase tracking-wider text-parchment/60">
                <th scope="col" className="py-2 pr-3">
                  Rank
                </th>
                <th scope="col" className="py-2 pr-3">
                  Team
                </th>
                <th scope="col" className="py-2 pr-3">
                  Last seen
                </th>
                {data.puzzles.map((p) => (
                  <th scope="col" key={p.id} className="py-2 pr-3" title={p.fragmentName}>
                    {p.kind === 'core' ? `F${p.id}` : p.kind === 'convergence' ? 'Conv' : 'Vault'}
                  </th>
                ))}
                <th scope="col" className="py-2 pr-3">
                  Errand · riddles · QR
                </th>
                <th scope="col" className="py-2 pr-3">
                  Lantern key
                </th>
                <th scope="col" className="py-2 pr-3">
                  Penalty
                </th>
                <th scope="col" className="py-2 pr-3">
                  Adjusted elapsed
                </th>
              </tr>
            </thead>
            <tbody>
              {data.teams.map((t) => (
                <tr key={t.id} className="border-b border-white/5 align-top">
                  <td className="py-3 pr-3 font-semibold text-ember-glow">#{t.rank}</td>
                  <th scope="row" className="py-3 pr-3 text-left font-medium text-parchment">
                    {t.name}
                  </th>
                  <td className="py-3 pr-3 text-parchment/60">{fmt(t.lastSeenAt)}</td>
                  {t.puzzles.map((p) => (
                    <td key={p.puzzleId} className="py-3 pr-3">
                      <Cell {...p} />
                    </td>
                  ))}
                  <td className="py-3 pr-3 text-parchment/80" title={t.errandLocation}>
                    {t.errandGroup} · {t.riddleSet}
                    <div className="text-xs text-parchment/50">QR poster {((t.id - 1) % 9) + 1}</div>
                  </td>
                  <td className="py-3 pr-3 font-code text-parchment/80">{t.lanternKey}</td>
                  <td className="py-3 pr-3 text-parchment/80">{t.penaltyMinutes} min</td>
                  <td className="py-3 pr-3 text-ember-glow">
                    {t.adjustedElapsedMs === null ? 'Unfinished' : formatDuration(t.adjustedElapsedMs)}
                    <div className="text-xs text-parchment/50">{t.totalHintsUsed} hints</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

function Cell({
  state,
  hintsUsed,
  attempts,
  solvedAt,
  startedAt,
}: AdminOverview['teams'][number]['puzzles'][number]) {
  const colour =
    state === 'SOLVED' ? 'text-ember-glow' : state === 'AVAILABLE' ? 'text-parchment' : 'text-parchment/35';
  return (
    <div className={colour}>
      <div className="font-medium">{state}</div>
      {(attempts > 0 || hintsUsed > 0) && (
        <div className="text-xs opacity-80">
          {attempts} tries · {hintsUsed} hints
        </div>
      )}
      {solvedAt ? (
        <div className="text-xs opacity-80">✓ {fmt(solvedAt)}</div>
      ) : startedAt ? (
        <div className="text-xs opacity-60">opened {fmt(startedAt)}</div>
      ) : null}
    </div>
  );
}

function fmt(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
