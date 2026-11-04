import { useEffect, useState } from 'react';
import { countdownParts, nextRelease } from '../services/gameClock';
import { useProgress } from '../store/useProgress';

export function useClockNow() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

function RollingDigit({ value }: { value: string }) {
  const [digits, setDigits] = useState({ current: value, previous: value });
  if (digits.current !== value) setDigits({ current: value, previous: digits.current });
  return <span className="release-digit" aria-hidden="true">
    <span key={digits.current} className={digits.current !== digits.previous ? 'release-digit-track release-digit-moving' : 'release-digit-track'}>
      <span>{digits.previous}</span>
      <span>{digits.current}</span>
    </span>
  </span>;
}

export function ReleaseCountdown({ target, now, caption }: { target: number; now: number; caption: string }) {
  return <section className="relative isolate mx-auto flex w-full max-w-3xl flex-col items-center justify-center py-10 sm:py-14" aria-label="Next question release">
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center">
      <div className="h-52 w-52 rounded-full bg-ember/15 blur-3xl sm:w-96" />
      <div className="absolute h-56 w-56 rounded-full border border-ember/10 sm:h-72 sm:w-72" />
      <div className="absolute h-44 w-44 rotate-45 rounded-3xl border border-ember/10 sm:h-56 sm:w-56" />
    </div>
    <div role="timer" aria-live="off" aria-label={countdownParts(target, now).map(({ label, value }) => `${value} ${label.toLowerCase()}`).join(', ')} className="flex items-center justify-center gap-2 sm:gap-5">
      {countdownParts(target, now).map(({ label, value }, index) => <div key={label} className="flex items-center gap-2 sm:gap-5">
        {index > 0 && <span aria-hidden="true" className="pb-5 font-display text-2xl text-ember/50 sm:text-4xl">:</span>}
        <div className="text-center">
          <span className="release-number">{[...value].map((digit, index) => <RollingDigit key={index} value={digit} />)}</span>
          <span className="mt-3 block text-[8px] uppercase tracking-[0.15em] text-parchment/35 sm:text-[10px] sm:tracking-[0.3em]">{label}</span>
        </div>
      </div>)}
    </div>
    <p className="mt-8 text-center text-xs font-light tracking-wide text-parchment/50">{caption}</p>
  </section>;
}

export function GameClock() {
  const { progress, error, refresh } = useProgress();
  const now = useClockNow();
  if (error) return <p role="alert" className="mb-8 text-center text-xs text-marigold">
    Could not load the release timer. <button className="underline" onClick={() => void refresh()}>Retry</button>
  </p>;
  if (!progress) return null;
  const release = nextRelease(progress.puzzles, now);
  if (!release?.unlockAt || progress.gameComplete) return null;
  return <ReleaseCountdown target={Date.parse(release.unlockAt)} now={now}
    caption={`The next flame awakens · Question ${release.id} · ${new Date(release.unlockAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' })} IST`} />;
}
