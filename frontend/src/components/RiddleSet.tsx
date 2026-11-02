import { useEffect, useMemo, useState } from 'react';
import type { RiddleLine } from '../api/types';
import { useTeam } from '../store/team';

const MAX_INPUT = 40;
const lettersOnly = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * A set of riddles whose answers fill letter boxes; one box per answer is marked.
 * What players type here is a private scratchpad: it stays in this browser and is never sent to the server.
 */
export function RiddleSet({ items }: { items: RiddleLine[] }) {
  const { session } = useTeam();
  const storageKey = useMemo(
    () => `lostlight.riddles.${session?.teamId ?? 'anon'}.${items.map((i) => `${i.lengths.join('-')}:${i.mark}`).join('|')}`,
    [session?.teamId, items],
  );
  const [answers, setAnswers] = useState<string[]>(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
      return Array.isArray(saved) ? items.map((_, i) => (typeof saved[i] === 'string' ? (saved[i] as string) : '')) : items.map(() => '');
    } catch {
      return items.map(() => '');
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(answers));
    } catch {
      // Storage full or disabled: the scratchpad simply won't persist.
    }
  }, [storageKey, answers]);

  const marked = items.map((item, i) => lettersOnly(answers[i])[item.mark - 1] ?? '');

  return (
    <div className="space-y-4">
      <ol className="space-y-4">
        {items.map((item, i) => {
          const letters = lettersOnly(answers[i]);
          const inputId = `riddle-${i}`;
          let offset = 0;
          return (
            <li key={i} className="card !p-5">
              <div className="flex items-baseline gap-3">
                <span className="eyebrow shrink-0">{item.label}</span>
                <p className="text-base leading-relaxed text-parchment/90">{item.clue}</p>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-4">
                <div className="flex flex-wrap gap-3" aria-hidden="true">
                  {item.lengths.map((len, w) => {
                    const start = offset;
                    offset += len;
                    return (
                      <div key={w} className="flex gap-1">
                        {Array.from({ length: len }, (_, k) => {
                          const index = start + k;
                          const isMark = index === item.mark - 1;
                          return (
                            <span
                              key={k}
                              className={[
                                'flex h-9 w-8 items-center justify-center rounded-md border text-sm font-semibold uppercase',
                                isMark
                                  ? 'border-ember bg-ember/15 text-ember-glow shadow-ember'
                                  : 'border-white/15 bg-white/[0.03] text-parchment',
                              ].join(' ')}
                            >
                              {letters[index] ?? ''}
                            </span>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
                <label htmlFor={inputId} className="sr-only">
                  {item.label} answer ({item.lengths.join(', ')} letters, marked letter {item.mark})
                </label>
                <input
                  id={inputId}
                  className="input-ember !w-48 !py-2 text-sm uppercase"
                  value={answers[i]}
                  maxLength={MAX_INPUT}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Fill the boxes"
                  onChange={(e) => setAnswers((prev) => prev.map((a, j) => (j === i ? e.target.value : a)))}
                />
              </div>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-ember/30 bg-ember/5 px-5 py-4">
        <span className="eyebrow">Marked letters</span>
        <div className="flex gap-1.5" aria-live="polite">
          {marked.map((letter, i) => (
            <span
              key={i}
              className="flex h-10 w-9 items-center justify-center rounded-md border border-ember/60 text-base font-bold text-ember-glow"
            >
              {letter || '·'}
            </span>
          ))}
        </div>
        <span className="text-xs text-parchment/45">Your notes stay on this device.</span>
      </div>
    </div>
  );
}
