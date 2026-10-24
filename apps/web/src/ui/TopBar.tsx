import type { ReactNode } from 'react';
import { ChevronIcon, FlameIcon, GearIcon } from './icons';

export function TopBar({
  title,
  streak = 0,
  onStats,
  onSettings,
  onTitle,
  left,
}: {
  title: ReactNode;
  /** Makes the title a button (it opens the game picker). */
  onTitle?: () => void;
  streak?: number;
  /** The streak badge that opens stats; left out where no one game is shown. */
  onStats?: () => void;
  onSettings: () => void;
  /** Replaces the title (e.g. edit mode's Cancel). */
  left?: ReactNode;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-2 px-3 pt-[env(safe-area-inset-top)] wide:px-6">
      {left || !onTitle ? (
        <div className="display min-w-0 truncate text-[16px]">{left ?? title}</div>
      ) : (
        <button
          type="button"
          onClick={onTitle}
          className="display -ml-2 flex h-10 min-w-0 items-center gap-1 rounded-full px-2 text-[16px] hover:bg-surface-2"
        >
          <span className="truncate">{title}</span>
          <ChevronIcon className="size-4 shrink-0 rotate-90 text-muted" aria-hidden />
        </button>
      )}
      <div className="flex items-center gap-1">
        {onStats && (
          <button
            type="button"
            onClick={onStats}
            className="flex h-10 items-center gap-1 rounded-full px-3 text-[15px] font-semibold hover:bg-surface-2"
            aria-label={`Stats. Streak ${streak}`}
          >
            <FlameIcon className={streak > 0 ? 'text-gold' : 'text-muted'} />
            {streak}
          </button>
        )}
        <button
          type="button"
          onClick={onSettings}
          className="grid size-10 place-items-center rounded-full text-muted hover:bg-surface-2"
          aria-label="Settings"
        >
          <GearIcon />
        </button>
      </div>
    </header>
  );
}
