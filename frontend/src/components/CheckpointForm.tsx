import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { CheckpointResult } from '../api/types';
import { useTeam } from '../store/team';
import { SparkBurst } from './SparkBurst';

interface CheckpointFormProps {
  /** Pre-filled code (e.g. from a scanned QR deep link). Submitted automatically once. */
  initialCode?: string;
  onRedeemed?: (result: CheckpointResult) => void;
  autoFocus?: boolean;
  inputId?: string;
  /** Stack the input above a full-width button (for narrow sidebars). */
  stacked?: boolean;
}

export function CheckpointForm({
  initialCode,
  onRedeemed,
  autoFocus = false,
  inputId = 'checkpoint-code',
  stacked = false,
}: CheckpointFormProps) {
  const { session } = useTeam();
  const [code, setCode] = useState(initialCode ?? '');
  const [result, setResult] = useState<CheckpointResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const autoSubmitted = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function redeem(value: string) {
    if (!session || value.trim().length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.checkpoint(session.gameKey, value.trim());
      setResult(res);
      setCode('');
      onRedeemed?.(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (initialCode && !autoSubmitted.current) {
      autoSubmitted.current = true;
      void redeem(initialCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void redeem(code);
  }

  function reset() {
    setResult(null);
    setError(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  if (result) {
    return (
      <div role="status" className="relative animate-rise">
        {!result.alreadyVisited && <SparkBurst count={14} radius={70} className="-left-6 -top-6 right-auto bottom-auto h-24 w-24" />}
        <p className="eyebrow">{result.alreadyVisited ? 'Already claimed' : 'Marker claimed'}</p>
        <h3 className="mt-3 text-2xl text-ember-glow">{result.title}</h3>
        <p className="mt-3 font-light text-parchment/80">{result.message}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          {result.puzzleId && (
            <Link to={`/puzzle/${result.puzzleId}`} className="btn-ember !px-6 !py-2.5 text-sm">
              Go to the fragment
            </Link>
          )}
          <button type="button" className="btn-ghost" onClick={reset}>
            Enter another code
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <label htmlFor={inputId} className="eyebrow block">
        Found a code?
      </label>
      <div className={`mt-4 flex gap-3 ${stacked ? 'flex-col' : 'max-sm:flex-col'}`}>
        <input
          ref={inputRef}
          id={inputId}
          className="input-ember flex-1 font-code text-lg uppercase tracking-[0.2em]"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          maxLength={64}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          autoFocus={autoFocus}
          placeholder="DIYA-00"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${inputId}-error` : undefined}
        />
        <button type="submit" className="btn-ember shrink-0" disabled={busy || code.trim().length === 0}>
          {busy ? 'Seeking…' : 'Claim'}
        </button>
      </div>
      {error && (
        <p id={`${inputId}-error`} role="alert" className="mt-3 text-sm text-marigold">
          {error}
        </p>
      )}
    </form>
  );
}
