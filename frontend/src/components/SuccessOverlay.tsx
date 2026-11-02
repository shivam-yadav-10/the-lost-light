import { useCallback, useEffect, useRef, useState } from 'react';
import { DiyaLamp } from './DiyaLamp';
import { SparkBurst } from './SparkBurst';

interface SuccessOverlayProps {
  /** Small label above the headline, e.g. "Fragment IV". */
  eyebrow: string;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onClose: () => void;
}

// Firework bursts around the screen: position (%), size and start delay (ms).
const BURSTS = [
  { left: 18, top: 24, radius: 120, delay: 250 },
  { left: 82, top: 22, radius: 140, delay: 650 },
  { left: 12, top: 72, radius: 100, delay: 1050 },
  { left: 88, top: 70, radius: 110, delay: 1450 },
  { left: 50, top: 12, radius: 90, delay: 1850 },
];

/** Full-screen "you did it" moment shown after a correct answer. Dismiss with the button, Escape or a backdrop click. */
// Keep in sync with the success-out animation duration in index.css.
const CLOSE_MS = 550;

export function SuccessOverlay({ eyebrow, title, subtitle, actionLabel = 'Continue', onClose }: SuccessOverlayProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);

  // Play the fade-out first, then hand control back to the page.
  const requestClose = useCallback(() => {
    if (closeTimer.current !== undefined) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setClosing(true);
    closeTimer.current = window.setTimeout(onClose, reduceMotion ? 0 : CLOSE_MS);
  }, [onClose]);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  useEffect(() => {
    buttonRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose();
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [requestClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="success-title"
      className={`success-backdrop fixed inset-0 z-50 flex items-center justify-center overflow-hidden ${closing ? 'success-closing' : ''}`}
      onClick={requestClose}
    >
      {/* light flooding out from the centre */}
      <div aria-hidden="true" className="success-glow pointer-events-none absolute inset-0" />

      {/* fireworks */}
      {BURSTS.map((b) => (
        <div
          key={`${b.left}-${b.top}`}
          aria-hidden="true"
          className="pointer-events-none absolute h-1 w-1"
          style={{ left: `${b.left}%`, top: `${b.top}%` }}
        >
          {/* hidden until its delay passes, so the bursts go off one after another */}
          <div className="success-burst-delay absolute inset-0" style={{ animationDelay: `${b.delay}ms` }}>
            <SparkBurst loop count={28} radius={b.radius} />
          </div>
        </div>
      ))}

      <div
        className="success-content relative flex max-w-3xl flex-col items-center px-6 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="success-rise eyebrow" style={{ animationDelay: '150ms' }}>
          {eyebrow}
        </p>
        <h2 id="success-title" className="success-rise text-shimmer mt-3 text-5xl lg:text-7xl" style={{ animationDelay: '300ms' }}>
          {title}
        </h2>
        {subtitle && (
          <p className="success-rise mt-5 text-lg text-parchment/85 lg:text-xl" style={{ animationDelay: '450ms' }}>
            {subtitle}
          </p>
        )}
        <button
          ref={buttonRef}
          type="button"
          className="success-rise btn-ember mt-8 !px-10"
          style={{ animationDelay: '600ms' }}
          onClick={requestClose}
        >
          {actionLabel}
        </button>
        <div className="success-pop relative mt-10" style={{ animationDelay: '450ms' }}>
          {/* rings of light pulsing out from the flame */}
          {[0, 2250].map((delay) => (
            <span
              key={delay}
              aria-hidden="true"
              className="success-ring pointer-events-none absolute left-1/2 top-[38%] h-32 w-32 rounded-full border border-ember-glow/50 shadow-[0_0_24px_rgba(251,191,36,0.15)]"
              style={{ animationDelay: `${1000 + delay}ms` }}
            />
          ))}
          <DiyaLamp state="SOLVED" size={180} igniteDelay={900} className="relative drop-shadow-[0_0_60px_rgba(251,191,36,0.75)]" />
          <SparkBurst count={26} radius={170} />
        </div>
      </div>
    </div>
  );
}
