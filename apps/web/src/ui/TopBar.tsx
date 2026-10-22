import type { ReactNode } from 'react';
import { FlameIcon, GearIcon } from './icons';

export function TopBar({
  title,
  streak,
  onStats,
  onSettings,
  left,
}: {
  title: ReactNode;
  streak: number;
  onStats: () => void;
  onSettings: () => void;
  /** Replaces the title (e.g. edit mode's Cancel). */
  left?: ReactNode;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-2 px-3 pt-[env(safe-area-inset-top)] wide:px-6">
      <div className="display min-w-0 truncate text-[16px]">{left ?? title}</div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onStats}
          className="flex h-10 items-center gap-1 rounded-full px-3 text-[15px] font-semibold hover:bg-surface-2"
          aria-label={`Stats. Streak ${streak}`}
        >
          <FlameIcon className={streak > 0 ? 'text-gold' : 'text-muted'} />
          {streak}
        </button>
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
