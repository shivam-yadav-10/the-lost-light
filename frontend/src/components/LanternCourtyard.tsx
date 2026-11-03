import { useEffect, useState } from 'react';
import {
  BEACON, BOARD_COLUMNS, BOARD_ROWS, COURTYARD_VERSION, courtyardAnswer, GATES, INITIAL_MIRRORS, LANTERNS, MIRRORS, nextLantern, SOURCE, traceCourtyard,
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
const WIDTH = BOARD_COLUMNS * 80 + 40;
const HEIGHT = BOARD_ROWS * 80 + 40;
const left = (x: number) => `${(position(x) + 20) / WIDTH * 100}%`;
const top = (y: number) => `${(position(y) + 20) / HEIGHT * 100}%`;

/** Tap-to-cycle lanterns and rotating mirrors with a live beam preview and local draft. */
export function LanternCourtyard({ teamDocId, busy, solved, feedback, onSubmit }: LanternCourtyardProps) {
  const [lanterns, setLanterns] = useState<string[]>(['', '', '', '', '']);
  const [mirrors, setMirrors] = useState<Mirror[]>([...INITIAL_MIRRORS]);
  const [error, setError] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const storageKey = `lostlight.${COURTYARD_VERSION}.${teamDocId}`;

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
  const ready = beam.reachedBeacon && new Set(beam.gates).size === 5 && new Set(beam.mirrorsVisited).size === MIRRORS.length;
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
    <section className={`card w-full !p-4 sm:!p-6 ${solved ? 'border-ember/60 shadow-ember' : ''}`} aria-labelledby="courtyard-heading">
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
            Tap a numbered gate to cycle its symbol: empty, Lotus, Star, Leaf, Bell, Moon, then empty.
            Use each symbol once. Tap mirrors A to T to turn them. The beam must visit all five gates
            and all twenty mirrors before reaching the beacon. The diya sends light to the right.
            Some wrong turns feed back into earlier mirrors; faded branches can lead to dark dead ends.
          </p>
          <div className="my-6 overflow-x-auto rounded-2xl border border-ember/20">
          <div className="courtyard-board relative w-full min-w-[1120px] bg-black/20" style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }}>
            <svg viewBox={`-20 -20 ${WIDTH} ${HEIGHT}`} className="h-full w-full" role="img" aria-labelledby="courtyard-map-title courtyard-map-description">
              <title id="courtyard-map-title">Courtyard light-path preview</title>
              <desc id="courtyard-map-description">The diya starts near the bottom centre, pointing east. Twenty mirrors form a winding path across the courtyard to the top-left beacon. Use the labelled mirror and gate buttons to explore the live light path.</desc>
              <g stroke="#f59e0b" fill="none" opacity="0.12">
                {Array.from({ length: BOARD_COLUMNS }, (_, i) => <path key={`v${i}`} d={`M${position(i)} 40V${position(BOARD_ROWS - 1)}`} />)}
                {Array.from({ length: BOARD_ROWS }, (_, i) => <path key={`h${i}`} d={`M40 ${position(i)}H${position(BOARD_COLUMNS - 1)}`} />)}
              </g>
              <g fill="none" stroke="#ad8051" strokeWidth="7" strokeDasharray="5 13" opacity="0.22" aria-hidden="true">
                <path d={`M${position(5)} ${position(1)}H${position(24)} M${position(15)} ${position(5)}H${position(24)} M${position(15)} ${position(5)}V${position(10)} M${position(21)} ${position(7)}H${position(24)} M${position(5)} ${position(3)}H${position(12)}`} />
              </g>
              <g stroke="#806440" strokeWidth="3" opacity="0.55" aria-hidden="true">
                {[{ x: 24, y: 1 }, { x: 24, y: 5 }, { x: 24, y: 7 }, { x: 15, y: 10 }, { x: 12, y: 3 }].map((point) => (
                  <path key={`${point.x}-${point.y}`}
                    d={`M${position(point.x) - 9} ${position(point.y) - 9}l18 18m0 -18l-18 18`} />
                ))}
              </g>
              <g transform="translate(720 120)">
              <g className="courtyard-rangoli" stroke="#f59e0b" fill="none">
                <circle cx="280" cy="280" r="115" strokeDasharray="3 9" />
                <circle cx="280" cy="280" r="100" opacity="0.5" />
                {Array.from({ length: 8 }, (_, index) =>
                  <path key={index} d="M280 180Q320 240 280 266Q240 240 280 180Z"
                    transform={`rotate(${index * 45} 280 280)`} opacity="0.5" />)}
              </g>
              </g>
              <g key={mirrors.join('-')} fill="none" stroke="#fbbf24" strokeLinecap="round" strokeLinejoin="round">
                <polyline className="courtyard-beam-aura" pathLength="1" strokeWidth="15"
                  points={beam.path.map((point) => `${position(point.x)},${position(point.y)}`).join(' ')} />
                <polyline className="courtyard-beam" pathLength="1" strokeWidth="4"
                  points={beam.path.map((point) => `${position(point.x)},${position(point.y)}`).join(' ')} />
                <polyline className="courtyard-beam-sparkle" pathLength="1" stroke="#fff4cc" strokeWidth="2"
                  points={beam.path.map((point) => `${position(point.x)},${position(point.y)}`).join(' ')} />
              </g>
              <g transform={`translate(${position(SOURCE.x)},${position(SOURCE.y)})`} fill="#fbbf24">
                <path d="M-23 5Q0 35 23 5Z" />
                <path className="courtyard-flame" d="M0 4Q-16 -12 0 -29Q16 -12 0 4Z" />
                <text x="0" y="52" textAnchor="middle" fontSize="18">Diya →</text>
              </g>
              <g transform={`translate(${position(BEACON.x)},${position(BEACON.y)})`}>
                <circle className={ready ? 'courtyard-lantern-lit' : 'courtyard-lantern'} r="25" fill={ready ? '#fbbf24' : '#211915'} stroke="#fbbf24" strokeWidth="2" />
                <text x="38" y="6" fill="#f3e8ce" fontSize="18">Beacon</text>
              </g>
            </svg>
            {GATES.map((gate, index) => (
              <button key={index} type="button" disabled={disabled}
                aria-label={`Gate ${index + 1}: ${LABELS[lanterns[index]] ?? 'empty'}. Click for ${LABELS[nextLantern(lanterns[index])] ?? 'empty'}.`}
                onClick={() => {
                  setError(null);
                  setLanterns((current) => current.map((value, i) => i === index ? nextLantern(value) : value));
                }}
                className={`absolute flex min-h-11 min-w-11 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-xl border bg-night text-ember-glow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember-glow disabled:opacity-50 ${litGates.has(index) && lanterns[index] ? 'courtyard-lantern-lit border-ember-glow' : 'border-ember/40'}`}
                style={{ left: left(gate.x), top: top(gate.y), width: '3%', aspectRatio: '1' }}>
                {lanterns[index] && <span className="w-7 sm:w-8"><LanternMark name={lanterns[index]} /></span>}
                <span className="text-xs leading-none">{index + 1}</span>
              </button>
            ))}
            {MIRRORS.map((mirror, index) => (
              <button key={index} type="button" disabled={disabled}
                onClick={() => { setError(null); setMirrors((current) => current.map((value, i) => i === index ? value === 'slash' ? 'backslash' : 'slash' : value)); }}
                aria-label={`Rotate mirror ${'ABCDEFGHIJKLMNOPQRST'[index]}, currently ${mirrors[index] === 'slash' ? 'forward slash' : 'backslash'}`}
                className="absolute flex min-h-11 min-w-11 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-lg border border-ember/70 bg-night text-ember-glow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember-glow disabled:opacity-50"
                style={{ left: left(mirror.x), top: top(mirror.y), width: '2.8%', aspectRatio: '1' }}>
                <span className="text-[10px] leading-none">{'ABCDEFGHIJKLMNOPQRST'[index]}</span>
                <span aria-hidden="true" className="courtyard-mirror font-code text-2xl leading-none"
                  style={{ transform: `rotate(${mirrors[index] === 'slash' ? 0 : 90}deg)` }}>/</span>
              </button>
            ))}
          </div>
          </div>
          <p role="status" className="text-sm text-parchment/70">
            {ready ? 'Light path connected. Check your lantern order against all four clues before submitting.' : `Light reaches ${litGates.size} of 5 gates and ${new Set(beam.mirrorsVisited).size} of ${MIRRORS.length} mirrors. Keep turning to reach the beacon.`}
          </p>
          <div className="mt-4 flex flex-wrap gap-3" aria-label="Lantern symbol legend">
            {LANTERNS.map((id) => <span key={id} className="flex items-center gap-1 text-xs text-parchment/70"><span className="w-6"><LanternMark name={id} /></span>{LABELS[id]}</span>)}
          </div>
          <p className="mt-3 text-xs text-parchment/50">Click a gate or focus it and press Space/Enter to cycle. Duplicate symbols must be changed before submission. On small screens, scroll the board sideways. Drafts stay in this browser.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" className="btn-ember" onClick={() => void offer()} disabled={disabled || !canSubmit}>
              {busy ? 'Lighting...' : 'Light the courtyard'}
            </button>
            <button type="button" className="btn-ghost" disabled={disabled}
              onClick={() => { setLanterns(['', '', '', '', '']); setMirrors([...INITIAL_MIRRORS]); setError(null); }}>
              Reset board
            </button>
          </div>
          {!canSubmit && <p className="mt-3 text-xs text-parchment/60">Use each symbol once and connect all twenty mirrors to enable submission.</p>}
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
    && Array.isArray(value.mirrors) && value.mirrors.length === MIRRORS.length
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
