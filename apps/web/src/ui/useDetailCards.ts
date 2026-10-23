// Which details card in a group is open: a mouse hover shows one, a tap or
// click pins it, and a tap elsewhere or Escape closes it.
import { useEffect, useRef, useState } from 'react';

/** Which of a group's cards is open, and the handlers that open it. */
export function useDetailCards<E extends HTMLElement>() {
  const [open, setOpen] = useState<{ i: number; pinned: boolean } | null>(null);
  const container = useRef<E>(null);

  useEffect(() => {
    if (!open?.pinned) return;
    const away = (e: PointerEvent) => {
      if (!container.current?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, [open?.pinned]);

  const trigger = (i: number) => {
    const shown = open?.i === i;
    return {
      'aria-expanded': shown,
      onClick: () => setOpen(shown && open.pinned ? null : { i, pinned: true }),
      onPointerEnter: (e: React.PointerEvent) =>
        e.pointerType === 'mouse' && !open?.pinned && setOpen({ i, pinned: false }),
      onPointerLeave: (e: React.PointerEvent) =>
        e.pointerType === 'mouse' && !open?.pinned && setOpen(null),
      onKeyDown: (e: React.KeyboardEvent) => {
        // Close the card, not the sheet around it.
        if (e.key === 'Escape' && open) {
          e.stopPropagation();
          setOpen(null);
        }
      },
    };
  };

  return { container, isOpen: (i: number) => open?.i === i, trigger };
}
