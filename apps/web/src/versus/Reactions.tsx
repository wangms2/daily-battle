// Spectators' reactions: the buttons to send one, and each one floating up
// over the battle it's for (players see those on their own battle too).
import { REACTIONS, type Reaction } from '@daily-battle/versus';
import clsx from 'clsx';
import { useEffect, useState } from 'react';
import type { Feed } from './feed';
import type { ReactionEvent } from './useRoom';

/** Reactions to `match` as they arrive, rising and fading over whatever this sits on. */
export function FloatingReactions({
  feed,
  match,
  top = false,
}: {
  feed: Feed<ReactionEvent>;
  match: string;
  /** Pinned near the top of the screen (over a player's own battle) instead of over a card. */
  top?: boolean;
}) {
  const [shown, setShown] = useState<ReactionEvent[]>([]);
  useEffect(
    () =>
      // Only new ones: earlier reactions already floated by.
      feed.listen((r) => {
        if (r.match !== match) return;
        setShown((s) => [...s.slice(-6), r]);
        window.setTimeout(() => setShown((s) => s.filter((x) => x.n !== r.n)), 2300);
      }, feed.size),
    [feed, match],
  );
  return (
    <div
      className={clsx(
        'pointer-events-none inset-x-0 z-20 flex justify-center',
        top ? 'fixed top-14 h-24' : 'absolute bottom-2',
      )}
      aria-live="polite"
    >
      {shown.map((r, i) => (
        <span
          key={r.n}
          className="anim-reaction absolute flex flex-col items-center"
          style={{ left: `${30 + ((r.n * 23 + i * 7) % 40)}%` }}
        >
          <span className="text-[28px] leading-none">{r.emoji}</span>
          <span className="rounded-full bg-black/55 px-1.5 text-[10px] font-semibold text-white">
            {r.from}
          </span>
        </span>
      ))}
    </div>
  );
}

export function ReactionBar({
  onReact,
  compact = false,
}: {
  onReact: (emoji: Reaction) => void;
  /** Smaller buttons, to share a row with a phone card's log line. */
  compact?: boolean;
}) {
  return (
    <div className={clsx('flex', !compact && 'gap-1')} role="group" aria-label="React">
      {REACTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onReact(emoji)}
          className={clsx(
            'grid place-items-center rounded-full hover:bg-surface-2 active:scale-90',
            compact ? 'size-8 text-[16px]' : 'size-9 text-[18px]',
          )}
          aria-label={`React ${emoji}`}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
