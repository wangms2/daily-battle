// A countdown from what the room last said: a battle clock, the swap, the
// build, or the break between rounds.
import clsx from 'clsx';
import { useNow } from '../state/context';

const clockText = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** `ms` left as of `at` (when the room said so); nothing when it's null. */
export function Countdown({
  ms,
  at,
  label = 'Time left',
  className,
}: {
  ms: number | null;
  at: number;
  label?: string;
  className?: string;
}) {
  const now = useNow(250).getTime();
  if (ms === null) return null;
  const left = Math.max(0, ms - (now - at));
  return (
    <span
      role="timer"
      aria-label={`${label} ${clockText(left)}`}
      className={clsx(
        'rounded-chip px-2 py-1 text-[14px] font-semibold tabular-nums',
        left <= 10_000 ? 'bg-bad text-white' : 'bg-surface-2',
        className,
      )}
    >
      {clockText(left)}
    </span>
  );
}
