import type { ReactNode } from 'react';

/** Common full-bleed layout for one beat of the intro: centred content over the ambient backdrop. */
export function StoryScene({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`relative flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-8 px-6 text-center ${className}`}>
      {children}
    </div>
  );
}

export interface IntroLine {
  text: string;
  /** Extra visual weight for the one line in a scene that should land hardest. */
  emphasis?: boolean;
}

/**
 * Reserves a stable vertical slot for a beat's text — a fixed-height box, so a one-line beat
 * and a three-line beat never change the overall scene layout (which is what made the visuals
 * above appear to drift beat to beat). The text itself centres within that fixed box, so a
 * single line still looks balanced rather than pinned to the top of empty space.
 */
export function TextSlot({ children }: { children: ReactNode }) {
  return <div className="flex min-h-[7.5rem] w-full flex-col items-center justify-center sm:min-h-[8.5rem] lg:min-h-[9.5rem]">{children}</div>;
}

/**
 * Reveals a short stack of lines one at a time. Timing is driven entirely by CSS animation
 * delay, so scenes just render the lines and the reveal paces itself — no manual timers needed
 * for the text itself (scenes still use a timer to know when to advance).
 */
export function Lines({
  lines,
  startDelayMs = 350,
  lineGapMs = 1600,
  className = '',
}: {
  lines: IntroLine[];
  startDelayMs?: number;
  lineGapMs?: number;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center gap-3 ${className}`} aria-live="polite">
      {lines.map((line, i) => (
        <p
          key={i}
          className={
            line.emphasis
              ? 'story-line-in text-shimmer text-2xl font-semibold tracking-wide lg:text-4xl'
              : 'story-line-in story-text text-lg font-light leading-snug text-parchment/90 lg:text-2xl'
          }
          style={{ animationDelay: `${startDelayMs + i * lineGapMs}ms` }}
        >
          {line.text}
        </p>
      ))}
    </div>
  );
}
