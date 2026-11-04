import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Diya } from '../components/Diya';
import { Layout } from '../components/Layout';
import { GameServicesUnavailableError } from '../services/firebase';
import { runFirebaseConnectivityDiagnostic } from '../services/firebaseDiagnostics';
import { TeamLoginError, validateTeamGameKey } from '../services/teamService';
import { useTeam } from '../store/team';

export function LoginPage() {
  const { session, signIn } = useTeam();
  const navigate = useNavigate();
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (session) return <Navigate to="/dashboard" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const gameKey = key.trim().toUpperCase();
    if (!gameKey) return;
    setBusy(true);
    setError(null);
    try {
      const team = await validateTeamGameKey(gameKey);
      if (import.meta.env.DEV) await runFirebaseConnectivityDiagnostic();
      signIn({ teamId: team.teamNumber, teamDocId: team.teamId, teamName: team.teamName });
      if (team.introSeen) navigate('/dashboard', { replace: true });
      else navigate('/story', { replace: true, state: { first: true } });
    } catch (err) {
      setError(
        err instanceof TeamLoginError || err instanceof GameServicesUnavailableError
          ? err.message
          : 'Something went wrong.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Layout bare lanterns>
      <section className="flex min-h-dvh flex-col items-center justify-center py-24">
        <Diya size={84} className="animate-rise" />
        <h1 className="mt-10 text-4xl text-ember-glow lg:text-5xl animate-rise">Speak the word</h1>
        <p className="mt-5 max-w-sm text-center text-base font-light text-parchment/65 animate-rise">
          Each team was given a key. Enter it once; this device will remember you.
        </p>

        <form onSubmit={onSubmit} className="card mt-12 w-full max-w-md animate-rise" noValidate>
          <label htmlFor="gameKey" className="eyebrow block">
            Team key
          </label>
          <input
            id="gameKey"
            name="gameKey"
            className="input-ember mt-4 text-center font-code text-xl uppercase tracking-[0.3em]"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={64}
            placeholder="XXXX-0000"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'gameKey-error' : undefined}
          />
          {error && (
            <p id="gameKey-error" role="alert" className="mt-3 text-sm text-marigold">
              {error}
            </p>
          )}
          <button type="submit" className="btn-ember mt-8 w-full" disabled={busy || key.trim().length === 0}>
            {busy ? 'Listening…' : 'Light the way'}
          </button>
        </form>
      </section>
    </Layout>
  );
}
