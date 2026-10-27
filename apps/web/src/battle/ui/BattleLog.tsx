// The battle text under the field on phones: the log as it flows, as much as the
// box holds, ending at the newest line, with a divider at each turn. Scroll up for
// earlier turns, or tap the arrow at the top (it goes back a turn at a time). It
// follows the newest line until you scroll up; then a "Latest" cue at the bottom
// jumps back and follows again, as does the next turn or skip (`follow`).
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
  follow,
}: {
  log: string[];
  /**
   * Changes when the player wants the newest lines again (a new turn, or a
   * skip): the log follows from there, even if a tap had nudged it up.
   */
  follow?: number;
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

  useEffect(() => {
    following.current = true;
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [follow]);

  const lineCount = log.length;
  useEffect(() => {
    const el = scroller.current;
    if (el && following.current) el.scrollTop = el.scrollHeight;
    measure();
  }, [lineCount, measure]);

  const calm = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  /** Scrolls to the start of the turn above the top of the view. */
  const back = () => {
    const el = scroller.current;
    if (!el) return;
    const tops = [...el.querySelectorAll<HTMLElement>('[data-turn]')].map((b) => b.offsetTop);
    const target = tops.filter((t) => t < el.scrollTop - 4).at(-1) ?? 0;
    el.scrollTo({ top: target, behavior: calm() ? 'auto' : 'smooth' });
  };

  /** Back to the newest line, following it again. */
  const latest = () => {
    const el = scroller.current;
    if (!el) return;
    following.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: calm() ? 'auto' : 'smooth' });
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
            back();
          }}
          className="battle-textcue top-1.5"
        >
          <ChevronIcon className="size-4 -rotate-90" aria-hidden />
        </button>
      )}
      {more.down && (
        <button
          type="button"
          aria-label="Back to the latest"
          onClick={(e) => {
            e.stopPropagation();
            latest();
          }}
          className="battle-textlatest"
        >
          Latest
          <ChevronIcon className="size-3.5 rotate-90" aria-hidden />
        </button>
      )}
    </div>
  );
}
