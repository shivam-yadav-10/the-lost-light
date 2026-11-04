import { useEffect, useState } from 'react';
import { countdownParts, nextRelease } from '../services/gameClock';
import { formatDuration } from '../services/gameRules';
import { useProgress } from '../store/useProgress';

export function GameClock() {
  const { progress, error, refresh } = useProgress();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (error) return <p role="alert" className="mb-8 text-sm text-marigold">
    Could not load the game clock. <button className="underline" onClick={() => void refresh()}>Retry</button>
  </p>;
  if (!progress) return null;
  const start = Date.parse(progress.scheduleStartAt);
  const release = nextRelease(progress.puzzles, now);
  const beforeStart = now < start;
  const target = beforeStart ? start : release?.unlockAt ? Date.parse(release.unlockAt) : null;
  const elapsed = progress.elapsedMs ?? Math.max(0, now - start);
  const adjusted = progress.adjustedElapsedMs ?? elapsed + progress.penaltyMinutes * 60000;
  const heading = progress.gameComplete ? 'Your light is complete' : beforeStart ? 'The first flame awaits'
    : release ? `Question ${release.id} releases in` : 'Every scheduled flame has been released';

  return <section aria-label="Game timing" className="relative mb-8 overflow-hidden rounded-3xl border border-ember/35 bg-gradient-to-br from-midnight-800 via-midnight-900 to-ember/10 p-5 shadow-ember sm:p-6">
    <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-20 h-56 w-56 rounded-full bg-ember/10 blur-3xl" />
    <div className="relative flex flex-wrap items-center justify-between gap-6">
      <div className="min-w-0">
        <p className="eyebrow text-ember-glow">The festival clock · IST</p>
        <h2 className="mt-2 font-display text-xl text-parchment sm:text-2xl">{heading}</h2>
        <p className="mt-2 text-xs leading-relaxed text-parchment/60">
          {target !== null && !progress.gameComplete
            ? `${new Date(target).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })} IST. Earlier questions must still be completed.`
            : 'Convergence and the Vault open when their prerequisites are complete.'}
        </p>
      </div>
      {target !== null && !progress.gameComplete && <div className="flex gap-2 sm:gap-3" role="timer" aria-label="Time until scheduled release" aria-live="off">
        {countdownParts(target, now).map(({ label, value }) => <div key={label} className="min-w-[3.25rem] rounded-2xl border border-ember/25 bg-black/20 px-2 py-3 text-center sm:min-w-[4rem]">
          <span className="block font-code text-2xl tabular-nums text-ember-glow sm:text-3xl">{value}</span>
          <span className="mt-1 block text-[9px] uppercase tracking-widest text-parchment/50">{label}</span>
        </div>)}
      </div>}
    </div>
    {!beforeStart && <div className="relative mt-5 flex flex-wrap gap-x-6 gap-y-2 border-t border-ember/15 pt-4 text-xs text-parchment/65" aria-live="off">
      <span>{progress.gameComplete ? 'Final time' : 'Elapsed since 1 PM'} <strong className="ml-1 font-code tabular-nums text-parchment">{formatDuration(elapsed)}</strong></span>
      <span>Hint penalty <strong className="ml-1 text-ember-glow">+{progress.penaltyMinutes} min</strong></span>
      <span>Adjusted time <strong className="ml-1 font-code tabular-nums text-ember-glow">{formatDuration(adjusted)}</strong></span>
    </div>}
    <p className="relative mt-3 text-[10px] text-parchment/40">Live display uses this device's clock. Ranking uses recorded completion time plus hint penalties.</p>
  </section>;
}
