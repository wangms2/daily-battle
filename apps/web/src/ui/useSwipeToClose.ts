// Drag a bottom sheet down to close it, as its handle suggests. The drag starts
// only from the handle and header (never inside scrolling content) and only
// after the finger moves a little, so taps on the header's buttons still work.
// Past 30% of the sheet's height, or on a quick flick, it closes; otherwise it
// springs back.
import { useRef, type PointerEvent } from 'react';

/** Movement (px) before a press counts as a drag rather than a tap. */
const SLOP = 6;
/** Release faster than this (px/ms) downward closes, however short the drag. */
const FLICK = 0.6;

export function useSwipeToClose(onClose: () => void, enabled: boolean) {
  const sheet = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; y0: number; t0: number; dy: number; active: boolean } | null>(
    null,
  );

  const reducedMotion = () =>
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const place = (dy: number, animate: boolean) => {
    const el = sheet.current;
    if (!el) return;
    el.style.transition = animate && !reducedMotion() ? 'transform 180ms ease-out' : 'none';
    el.style.transform = dy ? `translateY(${dy}px)` : '';
  };

  const handlers = enabled
    ? {
        onPointerDown: (e: PointerEvent<HTMLElement>) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          drag.current = { id: e.pointerId, y0: e.clientY, t0: e.timeStamp, dy: 0, active: false };
        },
        onPointerMove: (e: PointerEvent<HTMLElement>) => {
          const d = drag.current;
          if (!d || d.id !== e.pointerId) return;
          const dy = Math.max(0, e.clientY - d.y0);
          if (!d.active) {
            if (dy < SLOP) return;
            d.active = true;
            // Only now, so a plain tap still reaches the button under the finger.
            e.currentTarget.setPointerCapture(e.pointerId);
          }
          d.dy = dy;
          place(dy, false);
        },
        onPointerUp: (e: PointerEvent<HTMLElement>) => {
          const d = drag.current;
          drag.current = null;
          if (!d?.active || d.id !== e.pointerId) return;
          const height = sheet.current?.offsetHeight ?? 1;
          const speed = d.dy / Math.max(1, e.timeStamp - d.t0);
          if (d.dy > height * 0.3 || (speed > FLICK && d.dy > 24)) {
            place(height, true);
            onClose();
          } else {
            place(0, true);
          }
        },
        onPointerCancel: () => {
          drag.current = null;
          place(0, true);
        },
      }
    : {};

  return { sheet, handlers };
}
