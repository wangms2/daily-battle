// The header of the daily game's screens: the home screens' band and seam, so
// tapping Play carries on in the same place, in the color of the generation being
// played (its share card's color).
import type { FormatId } from '@daily-battle/data/formats';
import type { ReactNode } from 'react';
import { LIDS } from '../lib/genColors';
import { ChevronIcon, FlameIcon, GearIcon } from './icons';

export function TopBar({
  title,
  streak = 0,
  onStats,
  onSettings,
  onTitle,
  left,
  format,
}: {
  title: ReactNode;
  /** Makes the title a back button (to the day's page). */
  onTitle?: () => void;
  streak?: number;
  /** The streak badge that opens stats; left out where no one game is shown. */
  onStats?: () => void;
  onSettings: () => void;
  /** Replaces the title (e.g. edit mode's Cancel). */
  left?: ReactNode;
  /** The generation being played; its color replaces the clay. */
  format?: FormatId;
}) {
  const colors = format && LIDS[format];
  return (
    <>
      <header
        style={
          colors
            ? { background: `linear-gradient(165deg, ${colors.lid}, ${colors.deep})` }
            : undefined
        }
        className="home-top flex h-12 shrink-0 items-center justify-between gap-2 px-3 pt-[env(safe-area-inset-top)] wide:px-6"
      >
        {left || !onTitle ? (
          <div className="home-serif min-w-0 truncate text-[16px]">{left ?? title}</div>
        ) : (
          <button
            type="button"
            onClick={onTitle}
            title="Back"
            className="home-serif relative z-10 -ml-2 flex h-10 min-w-0 items-center gap-1 rounded-full pr-2 pl-1 text-[16px] hover:bg-white/10"
          >
            <ChevronIcon className="size-[18px] shrink-0 rotate-180 text-white/80" aria-hidden />
            <span className="truncate">{title}</span>
          </button>
        )}
        <div className="relative z-10 flex items-center gap-1">
          {onStats && (
            <button
              type="button"
              onClick={onStats}
              className="flex h-10 items-center gap-1 rounded-full px-3 text-[15px] font-semibold hover:bg-white/10"
              aria-label={`Stats. Streak ${streak}`}
            >
              <FlameIcon className={streak > 0 ? 'text-[#f0cf7a]' : 'text-white/70'} />
              {streak}
            </button>
          )}
          <button
            type="button"
            onClick={onSettings}
            className="grid size-10 place-items-center rounded-full text-white/85 hover:bg-white/10"
            aria-label="Settings"
          >
            <GearIcon />
          </button>
        </div>
      </header>
      <div className="home-seam is-thin" />
    </>
  );
}
