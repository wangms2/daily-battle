// A countdown from what the room last said: a battle clock, the swap, the
// build, or the break between rounds.
import clsx from 'clsx';
import { useNow } from '../state/context';

const clockText = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const ClockGlyph = () => (
  <svg viewBox="0 0 16 16" className="size-[15px] shrink-0" aria-hidden>
    <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <path
      d="M8 4.5V8l2.4 1.6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);

/**
 * `ms` left as of `at` (when the room said so). When `ms` is null the clock
 * isn't running: `paused` (a battle's bank, while it waits on the foe) shows
 * still, otherwise nothing does.
 */
export function Countdown({
  ms,
  at,
  paused,
  label = 'Time left',
  className,
}: {
  ms: number | null;
  at: number;
  paused?: number;
  label?: string;
  className?: string;
}) {
  const now = useNow(250).getTime();
  if (ms === null && paused === undefined) return null;
  const running = ms !== null;
  const left = running ? Math.max(0, ms - (now - at)) : paused!;
  return (
    <span
      role="timer"
      aria-label={`${label} ${clockText(left)}${running ? '' : ', paused'}`}
      className={clsx(
        'inline-flex items-center gap-1 rounded-chip border px-2.5 py-1 text-[16px] font-bold tabular-nums',
        !running
          ? 'border-line bg-surface-2 text-muted'
          : left <= 10_000
            ? 'animate-pulse border-bad bg-bad text-white'
            : left <= 30_000
              ? 'border-gold bg-gold-soft text-on-gold'
              : 'border-line bg-surface text-ink',
        className,
      )}
    >
      <ClockGlyph />
      {clockText(left)}
    </span>
  );
}
