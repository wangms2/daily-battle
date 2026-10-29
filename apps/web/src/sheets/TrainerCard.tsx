// The trainer card (DESIGN.md §10): the player's name and password, today's shares,
// and every game's streaks and stars, one row for each difficulty played. The
// profile button in each header opens it; a game's 🔥 opens it at that game.
import type { FormatId } from '@daily-battle/data/formats';
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import clsx from 'clsx';
import { LIDS } from '../lib/genColors';
import type { Bucket, Stats } from '../lib/results';
import { isShareAll, type AnyShare } from '../lib/share';
import { Sheet } from '../ui/Sheet';
import { ShareAllButton } from '../ui/results';
import { TrainerSection } from './Trainer';

export interface TrainerGame {
  id: FormatId;
  /** "Gen 3 OU" */
  name: string;
  /** Each difficulty's stats, easiest first; the card shows those played. */
  rows: { bucket: Bucket; stats: Stats }[];
  /** Today's share for this game (every difficulty played); null before it's played. */
  share: AnyShare | null;
}

const ROW_LABEL: Record<Bucket, string> = {
  easy: 'Easy',
  normal: 'Normal',
  hard: 'Hard',
  coached: 'Coached',
};

function Total({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="rounded-card bg-surface-2 px-2 py-2.5 text-center">
      <div className="home-serif text-[22px] leading-tight tabular-nums">{value}</div>
      <div className="text-[12px] text-muted">{label}</div>
    </div>
  );
}

const cols = 'grid grid-cols-[minmax(0,1fr)_repeat(4,3rem)] items-center gap-x-1';

export function TrainerCard({
  open,
  onOpenChange,
  name,
  onRename,
  focus,
  games,
  shareAll,
  countdown,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string | undefined;
  onRename: (name: string) => void;
  /** The game to scroll to and mark (opened from its 🔥). */
  focus?: FormatId | undefined;
  games: TrainerGame[];
  /** Every game played today; offered when two or more are. */
  shareAll: AnyShare | null;
  countdown: string;
}) {
  const focused = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open || !focus) return;
    // After the sheet's first frame, so there's something to scroll.
    const id = requestAnimationFrame(() => focused.current?.scrollIntoView?.({ block: 'nearest' }));
    return () => cancelAnimationFrame(id);
  }, [open, focus]);

  const all = games.flatMap((g) => g.rows.map((r) => r.stats));
  const sum = (f: (s: Stats) => number) => all.reduce((n, s) => n + f(s), 0);
  const played = games.filter((g) => g.share);

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Trainer card" size="md" scroll>
      <TrainerSection name={name} onRename={onRename} />

      <section aria-label="Today" className="mt-1 border-t border-line pt-3">
        <h3 className="text-[13px] font-semibold text-muted">Today</h3>
        {played.length === 0 ? (
          <p className="mt-1 text-[14px] text-muted">No games played yet today.</p>
        ) : (
          <div className="mt-2 grid gap-2">
            {shareAll && isShareAll(shareAll) && (
              <ShareAllButton share={shareAll} variant="primary" className="w-full">
                Share all {shareAll.games.length} games
              </ShareAllButton>
            )}
            <div className="grid grid-cols-2 gap-2">
              {played.map((g) => (
                <ShareAllButton key={g.id} share={g.share!} className="w-full">
                  Share {g.name.replace(/ OU$/, '')}
                </ShareAllButton>
              ))}
            </div>
          </div>
        )}
        <p className="mt-2 text-[13px] text-muted">
          Next opponent in <span className="font-semibold text-ink tabular-nums">{countdown}</span>
        </p>
      </section>

      <section aria-label="Stats" className="mt-3 border-t border-line pt-3">
        <div className="grid grid-cols-3 gap-2">
          <Total value={`⭐ ${sum((s) => s.firstTryWins)}`} label="First tries" />
          <Total value={`✓ ${sum((s) => s.clears)}`} label="Clears" />
          <Total
            value={`🔥 ${all.reduce((n, s) => Math.max(n, s.bestStreak), 0)}`}
            label="Best streak"
          />
        </div>
        <div className="mt-3 grid gap-2 pb-1">
          {games.map((g) => {
            const rows = g.rows.filter((r) => r.stats.daysPlayed > 0);
            const isFocus = g.id === focus;
            return (
              <section
                key={g.id}
                ref={isFocus ? focused : undefined}
                aria-label={g.name}
                data-focus={isFocus || undefined}
                style={{ '--lid': LIDS[g.id].lid } as CSSProperties}
                className={clsx(
                  'rounded-card border border-line border-l-4 border-l-[var(--lid)] px-3 py-2',
                  isFocus && 'bg-surface-2',
                )}
              >
                <div className={cols}>
                  <h4 className="home-serif truncate text-[15px]">{g.name}</h4>
                  {rows.length > 0 &&
                    ['Streak', 'Best', '⭐', '✓'].map((h) => (
                      <span key={h} className="text-center text-[11px] text-muted">
                        {h}
                      </span>
                    ))}
                </div>
                {rows.length === 0 ? (
                  <p className="text-[13px] text-muted">Not played yet</p>
                ) : (
                  rows.map(({ bucket, stats }) => (
                    <div
                      key={bucket}
                      className={clsx(cols, 'min-h-7 text-[14px] tabular-nums')}
                      aria-label={`${ROW_LABEL[bucket]}: ${stats.streak}-day streak, best ${stats.bestStreak}, ${stats.firstTryWins} first tries, ${stats.clears} clears`}
                    >
                      <span className="truncate text-muted">{ROW_LABEL[bucket]}</span>
                      <span className="text-center font-semibold">
                        <span aria-hidden className={stats.streak > 0 ? '' : 'opacity-40'}>
                          🔥
                        </span>{' '}
                        {stats.streak}
                      </span>
                      <span className="text-center">{stats.bestStreak}</span>
                      <span className="text-center">{stats.firstTryWins}</span>
                      <span className="text-center">{stats.clears}</span>
                    </div>
                  ))
                )}
              </section>
            );
          })}
        </div>
      </section>
    </Sheet>
  );
}
