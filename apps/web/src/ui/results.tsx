// Shared pieces for showing a day's result: the try rows, and a Share button
// that falls back to copying (or showing the text to copy).
import clsx from 'clsx';
import { useEffect, useState, type ReactNode } from 'react';
import { COUNTED_TRIES, type DaySummary } from '../lib/results';
import { shareResult } from '../lib/share';
import { Sheet } from './Sheet';
import { Button } from './bits';

/** The tries that count, one row of six squares each (green = Pokémon left). */
export function TryRows({ summary, current }: { summary: DaySummary; current?: number }) {
  return (
    <div className="flex flex-col items-center gap-1">
      {summary.counted.map((a, i) => (
        <div
          key={i}
          className={clsx(
            'flex items-center gap-1.5 rounded-badge px-1.5 py-0.5',
            current === a.ts && 'bg-surface-2',
          )}
          role="img"
          aria-label={`Try ${i + 1}: ${a.result === 'win' ? 'won' : a.result === 'forfeit' ? 'gave up' : 'lost'}, ${a.remaining} of 6 left`}
        >
          <span
            className={clsx(
              'w-4 text-center text-[13px] font-bold',
              a.result === 'win' ? 'text-good' : 'text-bad',
            )}
            aria-hidden
          >
            {a.result === 'win' ? '✓' : '✗'}
          </span>
          {Array.from({ length: 6 }, (_, j) => (
            <span
              key={j}
              aria-hidden
              className={clsx(
                'size-4 rounded-[4px]',
                j >= a.remaining
                  ? 'bg-surface-2 ring-1 ring-line'
                  : a.result === 'forfeit'
                    ? 'bg-muted/50' // given up: still standing, but not a result
                    : 'bg-good',
              )}
            />
          ))}
        </div>
      ))}
      {summary.tries.length > COUNTED_TRIES && (
        <span className="text-[12px] text-muted">
          + {summary.tries.length - COUNTED_TRIES} practice
        </span>
      )}
    </div>
  );
}

/** Opens the share sheet, or copies with a "Copied" toast, or shows the text to copy by hand. */
export function ShareButton({
  text,
  variant = 'primary',
  className,
  children = 'Share',
}: {
  text: string;
  variant?: 'primary' | 'secondary';
  className?: string;
  children?: ReactNode;
}) {
  const [toast, setToast] = useState(false);
  const [manual, setManual] = useState(false);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(false), 1800);
    return () => clearTimeout(id);
  }, [toast]);
  return (
    <>
      <Button
        variant={variant}
        className={className}
        onClick={async () => {
          const outcome = await shareResult(text);
          if (outcome === 'copied') setToast(true);
          if (outcome === 'manual') setManual(true);
        }}
      >
        {children}
      </Button>
      {toast && (
        <div
          role="status"
          className="animate-fade-in fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-[14px] font-semibold text-bg shadow-card"
        >
          Copied to clipboard
        </div>
      )}
      <Sheet open={manual} onOpenChange={setManual} title="Copy your result">
        <textarea
          readOnly
          value={text}
          rows={text.split('\n').length}
          onFocus={(e) => e.currentTarget.select()}
          autoFocus
          className="w-full resize-none rounded-card border border-line bg-surface-2 p-3 text-[14px] leading-relaxed"
        />
      </Sheet>
    </>
  );
}
