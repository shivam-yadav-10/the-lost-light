import { useEffect, useState } from 'react';
import {
  BEACON, courtyardAnswer, GATES, INITIAL_MIRRORS, LANTERNS, MIRRORS, SOURCE, traceCourtyard,
  type Mirror,
} from '../services/courtyard';

interface LanternCourtyardProps {
  teamDocId: string;
  busy: boolean;
  solved: boolean;
  feedback: { ok: boolean; text: string } | null;
  onSubmit: (answer: string) => Promise<void>;
}

const LABELS: Record<string, string> = { lotus: 'Lotus', star: 'Star', leaf: 'Leaf', bell: 'Bell', moon: 'Moon' };
const position = (value: number) => (value + 0.5) * 80;

/** Accessible tap/select board with a live beam preview and team-scoped local draft. */
export function LanternCourtyard({ teamDocId, busy, solved, feedback, onSubmit }: LanternCourtyardProps) {
  const [lanterns, setLanterns] = useState<string[]>(['', '', '', '', '']);
  const [mirrors, setMirrors] = useState<Mirror[]>([...INITIAL_MIRRORS]);
  const [error, setError] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const storageKey = `lostlight.courtyard-v1.${teamDocId}`;

  useEffect(() => {
    setLanterns(['', '', '', '', '']);
    setMirrors([...INITIAL_MIRRORS]);
    setStorageError(null);
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const draft: unknown = JSON.parse(raw);
        if (!isDraft(draft)) throw new Error('The saved courtyard draft is invalid.');
        setLanterns(draft.lanterns);
        setMirrors(draft.mirrors);
      }
    } catch {
      setStorageError('Could not restore this browser\'s courtyard draft. Start a new arrangement below.');
    }
    setLoadedKey(storageKey);
  }, [storageKey]);

  useEffect(() => {
    if (loadedKey !== storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ lanterns, mirrors }));
    } catch {
      setStorageError('This browser cannot save your draft. Keep this page open until you submit.');
    }
  }, [lanterns, mirrors, loadedKey, storageKey]);

  const beam = traceCourtyard(mirrors);
  const ready = beam.reachedBeacon && new Set(beam.gates).size === 5;
  const litGates = new Set(beam.gates);
  const disabled = busy || solved || loadedKey !== storageKey;
  const canSubmit = ready && lanterns.every(Boolean) && new Set(lanterns).size === 5;

  async function offer() {
    setError(null);
    try {
      await onSubmit(courtyardAnswer(lanterns, mirrors));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit the courtyard. Please try again.');
    }
  }

  return (
    <section className={`card !p-4 sm:!p-6 ${solved ? 'border-ember/60 shadow-ember' : ''}`} aria-labelledby="courtyard-heading">
      <h2 id="courtyard-heading" className="eyebrow">The lantern courtyard</h2>
      {solved ? (
        <div className="py-16 text-center">
          <div className="mx-auto w-20 text-ember-glow"><LanternMark name="lotus" /></div>
          <p className="mt-6 font-display text-3xl text-ember-glow">The courtyard is alight</p>
          <p className="mt-3 text-parchment/70">Fragment VI has been recovered.</p>
        </div>
      ) : (
        <>
          <p className="mt-3 text-sm text-parchment/70">
            Place the lanterns using the clues, then tap mirrors A, B and C to turn them.
            The diya sends light to the right. Mirrors reflect it through a right angle.
          </p>
          <div className="relative my-6 aspect-square overflow-hidden rounded-2xl border border-ember/20 bg-black/20">
            <svg viewBox="0 0 560 560" className="h-full w-full" role="img" aria-labelledby="courtyard-map-title courtyard-map-description">
              <title id="courtyard-map-title">Courtyard light-path preview</title>
              <desc id="courtyard-map-description">The diya starts at the centre, pointing east. Mirror A is on the right, B at the top right, C at the top left. The beacon is at the bottom left. Gate 1 is between the diya and A; gate 2 between A and B; gates 3 and 4 between B and C; gate 5 between C and the beacon.</desc>
              <g stroke="#f59e0b" fill="none" opacity="0.12">
                {Array.from({ length: 7 }, (_, i) => <path key={i} d={`M${position(i)} 40V520 M40 ${position(i)}H520`} />)}
                <circle cx="280" cy="280" r="115" />
                <circle cx="280" cy="280" r="100" />
                <path d="M280 165L395 280L280 395L165 280Z" />
              </g>
              <polyline points={beam.path.map((point) => `${position(point.x)},${position(point.y)}`).join(' ')}
                fill="none" stroke="#fbbf24" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
              {GATES.map((gate, index) => (
                <g key={index} transform={`translate(${position(gate.x)},${position(gate.y)})`}>
                  <rect x="-29" y="-29" width="58" height="58" rx="14" fill="#211915"
                    stroke={litGates.has(index) && lanterns[index] ? '#fbbf24' : '#806440'} strokeWidth="2" />
                  {lanterns[index] && <svg x="-20" y="-22" width="40" height="40" viewBox="0 0 48 48" className="text-ember-glow"><LanternMark name={lanterns[index]} /></svg>}
                  <text y={lanterns[index] ? 24 : 6} textAnchor="middle" fill="#f3e8ce" fontSize="16">{index + 1}</text>
                </g>
              ))}
              <g transform={`translate(${position(SOURCE.x)},${position(SOURCE.y)})`} fill="#fbbf24">
                <path d="M-23 5Q0 35 23 5Z" />
                <path d="M0 4Q-16 -12 0 -29Q16 -12 0 4Z" />
                <text x="0" y="52" textAnchor="middle" fontSize="18">Diya →</text>
              </g>
              <g transform={`translate(${position(BEACON.x)},${position(BEACON.y)})`}>
                <circle r="25" fill={ready ? '#fbbf24' : '#211915'} stroke="#fbbf24" strokeWidth="2" />
                <text x="38" y="6" fill="#f3e8ce" fontSize="18">Beacon</text>
              </g>
            </svg>
            {MIRRORS.map((mirror, index) => (
              <button key={index} type="button" disabled={disabled}
                onClick={() => { setError(null); setMirrors((current) => current.map((value, i) => i === index ? value === 'slash' ? 'backslash' : 'slash' : value)); }}
                aria-label={`Rotate mirror ${'ABC'[index]}, currently ${mirrors[index] === 'slash' ? 'forward slash' : 'backslash'}`}
                className="absolute flex min-h-11 min-w-11 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-lg border border-ember/70 bg-night text-ember-glow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember-glow disabled:opacity-50"
                style={{ left: `${position(mirror.x) / 5.6}%`, top: `${position(mirror.y) / 5.6}%`, width: '11%', height: '11%' }}>
                <span className="text-[10px] leading-none">{'ABC'[index]}</span>
                <span aria-hidden="true" className="font-code text-2xl leading-none">{mirrors[index] === 'slash' ? '/' : '\\'}</span>
              </button>
            ))}
          </div>
          <p role="status" className="text-sm text-parchment/70">
            {ready ? 'Light path connected. Check your lantern order against all four clues before submitting.' : `Light reaches ${litGates.size} of 5 gates. Turn the mirrors to reach the beacon.`}
          </p>
          <fieldset disabled={disabled} className="mt-6">
            <legend className="eyebrow">Place one lantern at each gate</legend>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {lanterns.map((lantern, index) => (
                <label key={index} className="text-sm text-parchment/80">
                  Gate {index + 1}
                  <select value={lantern} className="input-ember mt-1 w-full"
                    onChange={(event) => {
                      const selected = event.target.value;
                      setError(null);
                      setLanterns((current) => current.map((value, i) => i === index ? selected : value));
                    }}>
                    <option value="">Choose a lantern</option>
                    {LANTERNS.map((id) => <option key={id} value={id} disabled={lantern !== id && lanterns.includes(id)}>{LABELS[id]}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </fieldset>
          <p className="mt-3 text-xs text-parchment/50">To move an already-placed lantern, clear its current gate first. Drafts are saved only in this browser; completed progress syncs to your team.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" className="btn-ember" onClick={() => void offer()} disabled={disabled || !canSubmit}>
              {busy ? 'Lighting...' : 'Light the courtyard'}
            </button>
            <button type="button" className="btn-ghost" disabled={disabled}
              onClick={() => { setLanterns(['', '', '', '', '']); setMirrors([...INITIAL_MIRRORS]); setError(null); }}>
              Reset board
            </button>
          </div>
          {!canSubmit && <p className="mt-3 text-xs text-parchment/60">Place all five lanterns and connect the beam to enable submission.</p>}
        </>
      )}
      {storageError && <p role="alert" className="mt-4 text-sm text-marigold">{storageError}</p>}
      {error && <p role="alert" className="mt-4 text-sm text-marigold">{error}</p>}
      {feedback && <p role="status" className={`mt-4 text-sm ${feedback.ok ? 'text-ember-glow' : 'text-marigold'}`}>{feedback.text}</p>}
    </section>
  );
}

function isDraft(value: unknown): value is { lanterns: string[]; mirrors: Mirror[] } {
  if (!value || typeof value !== 'object' || !('lanterns' in value) || !('mirrors' in value)) return false;
  return Array.isArray(value.lanterns) && value.lanterns.length === 5
    && value.lanterns.every((id) => id === '' || LANTERNS.some((lantern) => lantern === id))
    && new Set(value.lanterns.filter(Boolean)).size === value.lanterns.filter(Boolean).length
    && Array.isArray(value.mirrors) && value.mirrors.length === 3
    && value.mirrors.every((mirror) => mirror === 'slash' || mirror === 'backslash');
}

function LanternMark({ name }: { name: string }) {
  const paths: Record<string, string> = {
    lotus: 'M24 39C5 36 4 22 6 15C14 17 20 24 24 34C28 24 34 17 42 15C44 22 43 36 24 39ZM24 34C13 25 16 13 24 6C32 13 35 25 24 34Z',
    star: 'M24 5L30 17L43 19L33 29L35 43L24 36L12 43L15 29L5 19L18 17Z',
    leaf: 'M9 39C-1 14 22 5 41 7C43 29 30 46 9 39ZM9 39L33 15',
    bell: 'M11 33H37L33 26V19C33 7 15 7 15 19V26ZM19 38Q24 47 29 38M24 7V3',
    moon: 'M31 5C5 7 3 39 28 43C35 44 41 40 44 34C23 41 12 16 31 5Z',
  };
  return <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
