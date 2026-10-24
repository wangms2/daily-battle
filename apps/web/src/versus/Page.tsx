// The frame of a versus screen: a back button, a title, and a centered column.
import type { ReactNode } from 'react';
import { ChevronIcon } from '../ui/icons';

export function Page({
  title,
  back,
  onBack,
  children,
}: {
  title: string;
  back: string;
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 px-3 pt-[env(safe-area-inset-top)] wide:px-6">
        <button
          type="button"
          onClick={onBack}
          className="-ml-2 flex h-10 items-center gap-1 rounded-full px-2 text-[15px] text-muted hover:bg-surface-2"
        >
          <ChevronIcon className="size-4 rotate-180" aria-hidden />
          {back}
        </button>
        <h1 className="display min-w-0 flex-1 truncate text-center text-[16px]">{title}</h1>
        {/* Balances the back button so the title stays centered. */}
        <span className="w-16" aria-hidden />
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto w-full max-w-[560px] space-y-4 pt-2">{children}</div>
      </main>
    </div>
  );
}
