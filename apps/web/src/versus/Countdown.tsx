// A battle clock or lead-pick timer, counting down from what the room last said.
import clsx from 'clsx';
import { useNow } from '../state/context';
import type { LocalMatch } from './useRoom';

function timeLeft(match: LocalMatch, now: number): number | null {
  return match.timeLeftMs === null
    ? null
    : Math.max(0, match.timeLeftMs - (now - match.receivedAt));
}

const clockText = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Your time left, or nothing while it isn't your move. */
export function Countdown({ match, className }: { match: LocalMatch; className?: string }) {
  const now = useNow(250).getTime();
  const ms = timeLeft(match, now);
  if (ms === null) return null;
  return (
    <span
      role="timer"
      aria-label={`Time left ${clockText(ms)}`}
      className={clsx(
        'rounded-chip px-2 py-1 text-[14px] font-semibold tabular-nums',
        ms <= 10_000 ? 'bg-bad text-white' : 'bg-surface-2',
        className,
      )}
    >
      {clockText(ms)}
    </span>
  );
}
