// The frame of a versus screen: the home screens' clay band with a back button,
// a title, something on the right (the room drawer), and a centered column.
// `hero` is the band at the game picker's height, its title large and left, and
// the Poké Ball on the seam (With friends, opened from the landing like Play).
import clsx from 'clsx';
import type { ReactNode } from 'react';
import { ChevronIcon } from '../ui/icons';

export function Page({
  title,
  back,
  onBack,
  right,
  wide = false,
  hero = false,
  tight = false,
  children,
}: {
  title: string;
  back: string;
  onBack: () => void;
  right?: ReactNode;
  /** A wider column, for watching several battles on a big screen. */
  wide?: boolean;
  hero?: boolean;
  /** Closer sections, for a screen that should fit without scrolling (the lobby). */
  tight?: boolean;
  children: ReactNode;
}) {
  if (hero) {
    return (
      <div className="flex h-full flex-col">
        <header className="home-top home-hero relative shrink-0">
          <div className="absolute inset-x-0 top-0 z-20 flex h-12 items-center justify-between px-3 pt-[env(safe-area-inset-top)] wide:px-6">
            <button
              type="button"
              onClick={onBack}
              className="-ml-2 flex h-10 items-center gap-0.5 rounded-full pr-3 pl-1 font-semibold text-white hover:bg-white/10"
            >
              <ChevronIcon className="size-[18px] rotate-180" aria-hidden />
              {back}
            </button>
            {right}
          </div>
          <div className="absolute inset-x-0 top-12 z-10">
            <h1 className="home-serif mx-auto w-full max-w-[520px] px-5 text-[26px] leading-[1.1] wide:max-w-[880px] wide:px-4">
              {title}
            </h1>
          </div>
        </header>
        <div className="home-seam">
          <span aria-hidden className="home-ball is-small" />
        </div>
        <main
          className={clsx(
            'min-h-0 flex-1 overflow-y-auto px-4',
            tight
              ? 'pb-[max(0.5rem,env(safe-area-inset-bottom))]'
              : 'pb-[max(1rem,env(safe-area-inset-bottom))]',
          )}
        >
          <div className="mx-auto w-full max-w-[520px] space-y-4 pt-6 wide:max-w-[880px]">
            {children}
          </div>
        </main>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col">
      <header className="home-top flex h-12 shrink-0 items-center gap-2 px-3 pt-[env(safe-area-inset-top)] wide:px-6">
        <button
          type="button"
          onClick={onBack}
          className="relative z-10 -ml-2 flex h-10 items-center gap-1 rounded-full px-2 text-[15px] font-semibold text-white/90 hover:bg-white/10"
        >
          <ChevronIcon className="size-4 rotate-180" aria-hidden />
          {back}
        </button>
        <h1 className="home-serif min-w-0 flex-1 truncate text-center text-[17px]">{title}</h1>
        {/* Balances the back button so the title stays centered. */}
        <span className="relative z-10 flex min-w-16 justify-end">{right}</span>
      </header>
      <div className="home-seam is-thin" />
      <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div
          className={clsx(
            'mx-auto w-full pt-2 wide:pt-6',
            tight ? 'space-y-3' : 'space-y-4',
            wide ? 'max-w-[1200px]' : 'max-w-[560px] wide:max-w-[920px]',
          )}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
