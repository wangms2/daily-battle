// The battle text under the field on phones: the log as it flows, as much as the
// box holds, ending at the newest line, with a divider at each turn. Scroll up for
// earlier turns, or tap the arrow at the top (it goes back a turn at a time); the
// arrow at the bottom comes forward. It follows the newest line until you scroll up.
import clsx from 'clsx';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronIcon } from '../../ui/icons';
import { BattleLine } from './text';
import { turnBlocks } from './turns';

/** How near the end counts as "at the end", in px. */
const NEAR = 24;

export function BattleLog({
  log,
  onClick,
  className,
}: {
  log: string[];
  /** A tap on the text itself (it skips the playback). */
  onClick?: () => void;
  className?: string;
}) {
  const blocks = turnBlocks(log);
  const scroller = useRef<HTMLDivElement>(null);
  // Follows the newest line until the player scrolls up to look back.
  const following = useRef(true);
  const [more, setMore] = useState({ up: false, down: false });

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const up = el.scrollTop > 2;
    const down = el.scrollHeight - el.scrollTop - el.clientHeight > 2;
    following.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR;
    setMore((m) => (m.up === up && m.down === down ? m : { up, down }));
  }, []);

  const lineCount = log.length;
  useEffect(() => {
    const el = scroller.current;
    if (el && following.current) el.scrollTop = el.scrollHeight;
    measure();
  }, [lineCount, measure]);

  /** Scrolls to the start of the turn above (or below) the top of the view. */
  const go = (dir: -1 | 1) => {
    const el = scroller.current;
    if (!el) return;
    const tops = [...el.querySelectorAll<HTMLElement>('[data-turn]')].map((b) => b.offsetTop);
    const here = el.scrollTop;
    const target =
      dir < 0
        ? (tops.filter((t) => t < here - 4).at(-1) ?? 0)
        : (tops.find((t) => t > here + 4) ?? el.scrollHeight);
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ top: target, behavior: calm ? 'auto' : 'smooth' });
  };

  return (
    <div className={clsx('battle-textbox relative', className)} onClick={onClick}>
      <div
        ref={scroller}
        role="log"
        aria-label="Battle log"
        tabIndex={0}
        onScroll={measure}
        data-more-above={more.up || undefined}
        className="battle-textscroll"
      >
        <div>
          {blocks.length ? (
            blocks.map((b, i) => (
              <section key={i} data-turn={b.label} className="battle-turn">
                <p className="battle-line" data-kind="turn">
                  <span>{b.label}</span>
                </p>
                {b.lines.map((l, j) => (
                  <BattleLine key={j} text={l} />
                ))}
              </section>
            ))
          ) : (
            <p className="battle-turn">The battle is starting…</p>
          )}
        </div>
      </div>
      {more.up && (
        <button
          type="button"
          aria-label="Earlier turns"
          onClick={(e) => {
            e.stopPropagation();
            go(-1);
          }}
          className="battle-textcue top-1.5"
        >
          <ChevronIcon className="size-4 -rotate-90" aria-hidden />
        </button>
      )}
      {more.down && (
        <button
          type="button"
          aria-label="Later turns"
          onClick={(e) => {
            e.stopPropagation();
            go(1);
          }}
          className="battle-textcue bottom-1.5"
        >
          <ChevronIcon className="size-4 rotate-90" aria-hidden />
        </button>
      )}
    </div>
  );
}
