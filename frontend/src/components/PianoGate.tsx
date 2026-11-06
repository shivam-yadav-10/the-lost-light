import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { PIANO_FREQUENCIES, PIANO_KEYS, teamMelody, type PianoKey } from '../services/piano';

export function PianoGate({ teamDocId, onUnlocked }: { teamDocId: string; onUnlocked: () => Promise<void> }) {
  const melody = teamMelody(teamDocId);
  const [played, setPlayed] = useState<PianoKey[]>([]);
  const [active, setActive] = useState<PianoKey | null>(null);
  const [mode, setMode] = useState<'ready' | 'listen' | 'saving'>('ready');
  const [message, setMessage] = useState('Listen to your team’s eight-note melody, then play it back.');
  const audio = useRef<AudioContext | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const mounted = useRef(true);
  const locked = useRef(false);
  const attempt = useRef<PianoKey[]>([]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      timers.current.forEach(clearTimeout);
      if (audio.current) void audio.current.close();
    };
  }, []);

  async function sound(key: PianoKey) {
    audio.current ??= new AudioContext();
    await audio.current.resume();
    if (!mounted.current) return;
    const context = audio.current;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = 'triangle';
    oscillator.frequency.value = PIANO_FREQUENCIES[PIANO_KEYS.indexOf(key)];
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.55);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    setActive(key);
    timers.current.push(setTimeout(() => { if (mounted.current) setActive(null); }, 300));
  }

  function audioError(error: unknown) {
    if (!mounted.current) return;
    timers.current.forEach(clearTimeout);
    locked.current = false;
    setMode('ready');
    setActive(null);
    setMessage(error instanceof Error ? `Could not play audio: ${error.message}` : 'Audio is unavailable. Try listening again.');
  }

  async function listen() {
    if (locked.current) return;
    locked.current = true;
    attempt.current = [];
    setPlayed([]);
    setMode('listen');
    setMessage('Listen closely. The glowing keys show each note.');
    try {
      await sound(melody[0]);
      if (!mounted.current) return;
      melody.slice(1).forEach((key, index) => {
        timers.current.push(setTimeout(() => { void sound(key).catch(audioError); }, (index + 1) * 650));
      });
      timers.current.push(setTimeout(() => {
        if (!mounted.current) return;
        locked.current = false;
        setMode('ready');
        setMessage('Your turn. Replay all eight notes in order.');
      }, melody.length * 650));
    } catch (error) { audioError(error); }
  }

  async function play(key: PianoKey) {
    if (locked.current) return;
    try { await sound(key); } catch (error) { audioError(error); return; }
    if (!mounted.current || locked.current) return;
    if (key !== melody[attempt.current.length]) {
      attempt.current = [];
      setPlayed([]);
      setMessage('That note broke the melody. Start again, or listen once more.');
      return;
    }
    const next = [...attempt.current, key];
    attempt.current = next;
    setPlayed(next);
    if (next.length !== melody.length) {
      setMessage(`${next.length} of ${melody.length} notes matched.`);
      return;
    }
    locked.current = true;
    setMode('saving');
    setMessage('The melody matches. Opening Question III…');
    try {
      await api.unlockPiano(teamDocId, next);
      if (mounted.current) await onUnlocked();
    } catch (error) {
      if (!mounted.current) return;
      locked.current = false;
      attempt.current = [];
      setPlayed([]);
      setMode('ready');
      setMessage(error instanceof Error ? error.message : 'Could not save the melody. Please try again.');
    }
  }

  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      const target = event.target;
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey
        || target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      const key = PIANO_KEYS.find((note) => note === event.key.toUpperCase());
      if (!key) return;
      event.preventDefault();
      void play(key);
    }
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  });

  return <section className="card mx-auto mt-8 max-w-3xl space-y-6 text-center">
    <p className="eyebrow">III · A melody before the darkness</p>
    <h1 className="text-3xl text-ember-glow">Wake the sleeping piano</h1>
    <p className="text-parchment/70">Your team has its own melody. Match it to reveal the original question.</p>
    <button className="btn-ember" disabled={mode !== 'ready'} onClick={() => void listen()}>
      {mode === 'listen' ? 'Playing your melody…' : 'Listen to our melody'}
    </button>
    <div className="flex gap-1 rounded-xl bg-black/40 p-2 sm:gap-2 sm:p-4" role="group" aria-label="Piano keyboard">
      {PIANO_KEYS.map((key, index) => <button key={key} type="button" disabled={mode !== 'ready'}
        aria-label={`Play ${['C', 'D', 'E', 'F', 'G', 'A', 'B', 'high C', 'high D'][index]} with ${key}`}
        className={`flex h-36 min-w-0 flex-1 flex-col justify-end rounded-b-lg border pb-4 text-lg font-bold transition-colors sm:h-48 ${active === key ? 'border-ember-glow bg-ember-glow text-black shadow-ember' : 'border-parchment/40 bg-parchment text-black'}`}
        onClick={() => void play(key)}>{key}</button>)}
    </div>
    <p className="text-sm text-parchment/60">Use A S D F G H J K L, or tap the piano keys. You can listen as often as you like.</p>
    <div className="flex justify-center gap-2" aria-label={`${played.length} of eight notes matched`}>
      {melody.map((_, index) => <span key={index} aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${index < played.length ? 'bg-ember-glow' : 'bg-parchment/20'}`} />)}
    </div>
    <p role="status" aria-live="polite" className="text-sm text-marigold">{message}</p>
  </section>;
}
