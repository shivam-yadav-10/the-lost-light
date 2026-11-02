import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../api/client';
import type { AdminOverview } from '../api/types';

const ADMIN_KEY_STORAGE = 'lostlight.adminKey';
const REFRESH_MS = 15_000;

/** Minimal local organiser view. Plain styling on purpose — this is a utility, not part of the game. */
export function AdminPage() {
  const [adminKey, setAdminKey] = useState(() => sessionStorage.getItem(ADMIN_KEY_STORAGE) ?? '');
  const [draftKey, setDraftKey] = useState('');
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!adminKey) return;
    try {
      setData(await api.adminOverview(adminKey));
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 429)) {
        sessionStorage.removeItem(ADMIN_KEY_STORAGE);
        setAdminKey('');
      }
      setError(err instanceof Error ? err.message : 'Failed to load');
    }
  }, [adminKey]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    sessionStorage.setItem(ADMIN_KEY_STORAGE, draftKey);
    setAdminKey(draftKey);
    setDraftKey('');
  }

  /** Forces a core fragment open now, or re-locks it, overriding the day's release schedule. */
  async function toggleUnlock(puzzleId: number, currentlyLocked: boolean) {
    setTogglingId(puzzleId);
    setToggleError(null);
    try {
      setData(await api.adminSetPuzzleUnlock(adminKey, puzzleId, currentlyLocked));
    } catch (err) {
      setToggleError(err instanceof Error ? err.message : 'Could not change that fragment.');
    } finally {
      setTogglingId(null);
    }
  }

  /** Forgets the key and hides all organiser data; the key must be entered again. */
  function lock() {
    sessionStorage.removeItem(ADMIN_KEY_STORAGE);
    setAdminKey('');
    setDraftKey('');
    setData(null);
    setError(null);
  }

  if (!adminKey) {
    return (
      <main className="mx-auto max-w-sm p-6">
        <h1 className="text-2xl">Organiser access</h1>
        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <label htmlFor="adminKey" className="eyebrow block">
            Admin key
          </label>
          <input
            id="adminKey"
            type="password"
            className="input-ember"
            value={draftKey}
            onChange={(e) => setDraftKey(e.target.value)}
            autoComplete="current-password"
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
          <button type="button" className="btn-ember !py-1 !px-4 text-xs" onClick={lock} aria-label="Lock the organiser view">
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
                    {p.scheduleLocked ? `Locked · opens ${fmt(p.unlockAt)}` : 'Unlocked'}
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
            Overrides the scheduled release time for every team at once. Does not affect Convergence or the Vault, which
            unlock only once a team's own prerequisites are solved.
          </p>
        </section>
      )}

      {data && (
        <section className="mt-6 grid gap-4 sm:grid-cols-4" aria-label="Keeper seals">
          {data.keeperSeals.map((k) => (
            <div key={k.type} className="rounded-xl border border-ember/20 p-3 text-sm">
              <div className="text-xs uppercase tracking-wider text-parchment/50">
                Shard {k.type} · {k.name}
              </div>
              <div className="mt-1 font-code text-ember-glow">{k.seal}</div>
              <div className="text-xs text-parchment/50">
                {k.holders} team{k.holders === 1 ? '' : 's'} hold this shard
              </div>
            </div>
          ))}
          <p className="text-xs text-parchment/40 sm:col-span-4">
            Keeper seals are for the deadlock safeguard only (organizer-runbook.md). Never share the lantern keys below.
          </p>
        </section>
      )}

      {data && (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[1080px] border-collapse text-sm">
            <caption className="sr-only">Team progress by puzzle</caption>
            <thead>
              <tr className="border-b border-ember/30 text-left text-xs uppercase tracking-wider text-parchment/60">
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
                  Errand · riddles                </th>
                <th scope="col" className="py-2 pr-3">
                  Shard / rules
                </th>
                <th scope="col" className="py-2 pr-3">
                  Lantern key
                </th>
                <th scope="col" className="py-2 pr-3">
                  Penalty
                </th>
                <th scope="col" className="py-2 pr-3">
                  Adjusted Vault
                </th>
              </tr>
            </thead>
            <tbody>
              {data.teams.map((t) => (
                <tr key={t.id} className="border-b border-white/5 align-top">
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
                  </td>
                  <td className="py-3 pr-3 text-parchment/80">
                    {t.shardType ?? '—'}
                    {t.verifiedShards.length > 0 && <div className="text-xs opacity-70">{t.verifiedShards.join(' ')}</div>}
                  </td>
                  <td className="py-3 pr-3 font-code text-parchment/80">{t.lanternKey}</td>
                  <td className="py-3 pr-3 text-parchment/80">{t.penaltyMinutes} min</td>
                  <td className="py-3 pr-3 text-ember-glow">{fmt(t.adjustedVaultAt)}</td>
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
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
