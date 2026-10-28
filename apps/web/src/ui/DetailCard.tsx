// Small details cards on tap or hover, shared by moves (MoveList) and by items
// and abilities (Term): a mouse hover shows the card, a tap or click pins it,
// and a tap elsewhere or Escape closes it.
import clsx from 'clsx';
import type { ReactNode } from 'react';
import { useDetailCards } from './useDetailCards';

/** The floating card itself, above its trigger. */
export function DetailCardBox({
  id,
  right = false,
  below = false,
  className = 'max-w-[min(16rem,80vw)]',
  children,
}: {
  id: string;
  right?: boolean;
  /** Open under the trigger (at the top of a scrolling panel, where above is cut off). */
  below?: boolean;
  /** Width limits; the default fits a phone. */
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      id={id}
      role="tooltip"
      className={clsx(
        'card absolute z-20 w-64 p-2.5 text-left shadow-lg',
        below ? 'top-full mt-1.5' : 'bottom-full mb-1.5',
        className,
        right ? 'right-0' : 'left-0',
      )}
    >
      {children}
    </div>
  );
}

/**
 * An item or ability name that shows what it does on tap or hover. Without a
 * description it's plain text.
 */
export function Term({
  name,
  desc,
  kind,
  right = false,
  below = false,
  className,
}: {
  name: string;
  desc: string | undefined;
  kind: 'Item' | 'Ability' | 'Pokédex';
  right?: boolean;
  below?: boolean;
  className?: string;
}) {
  const { container, isOpen, trigger } = useDetailCards<HTMLSpanElement>();
  if (!desc) return <span className={className}>{name}</span>;
  const id = `term-${kind}-${name.replace(/\W/g, '')}`;
  return (
    <span ref={container} className="relative inline-block max-w-full">
      <button
        type="button"
        {...trigger(0)}
        aria-describedby={isOpen(0) ? id : undefined}
        className={clsx(
          'max-w-full truncate rounded-badge text-left underline decoration-dotted underline-offset-2',
          isOpen(0) && 'bg-accent-soft text-soft-ink',
          className,
        )}
      >
        {name}
      </button>
      {isOpen(0) && (
        <DetailCardBox id={id} right={right} below={below}>
          <div className="flex items-baseline gap-1.5">
            <span className="truncate text-[14px] font-semibold">{name}</span>
            <span className="text-[12px] text-muted">{kind}</span>
          </div>
          <p className="mt-1 text-[13px] leading-snug font-normal">{desc}</p>
        </DetailCardBox>
      )}
    </span>
  );
}
