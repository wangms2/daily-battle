// A bottom sheet on phones and a centered dialog on wide screens, built on
// Radix Dialog (focus trap, Escape, screen-reader labels).
import * as Dialog from '@radix-ui/react-dialog';
import clsx from 'clsx';
import type { ReactNode } from 'react';
import { CloseIcon } from './icons';

export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  wide = false,
  hideTitle = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** Let the dialog grow wider on desktop (e.g. side-by-side set cards). */
  wide?: boolean;
  hideTitle?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="animate-fade-in fixed inset-0 z-40 bg-black/45" />
        <Dialog.Content
          aria-describedby={description ? undefined : undefined}
          className={clsx(
            'animate-sheet-in fixed z-50 flex flex-col bg-surface text-ink shadow-card outline-none',
            'inset-x-0 bottom-0 max-h-[92dvh] rounded-t-sheet pb-[max(1rem,env(safe-area-inset-bottom))]',
            'wide:inset-auto wide:top-1/2 wide:left-1/2 wide:-translate-x-1/2 wide:-translate-y-1/2 wide:rounded-sheet wide:pb-5',
            wide ? 'wide:w-[min(960px,92vw)]' : 'wide:w-[440px]',
          )}
        >
          <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-line wide:hidden" aria-hidden />
          <div
            className={clsx(
              'flex items-start justify-between gap-3 px-5 pt-3',
              hideTitle && 'sr-only',
            )}
          >
            <div>
              <Dialog.Title className="display text-[17px]">{title}</Dialog.Title>
              {description && (
                <Dialog.Description className="mt-0.5 text-[14px] text-muted">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close
              className="-mr-2 grid size-10 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2"
              aria-label="Close"
            >
              <CloseIcon />
            </Dialog.Close>
          </div>
          {!description && <Dialog.Description className="sr-only">{title}</Dialog.Description>}
          <div className="min-h-0 px-5 pt-3">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
