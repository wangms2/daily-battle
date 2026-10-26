// Points at parts of the battle screen in a lesson demo (DESIGN.md §22): the
// rest dims, and each target (an element marked `data-spot="…"`: a type
// badge row, an HP bar, a move button) keeps its colour with a soft ring.
// It measures the real elements, so it works over any part of the screen.
import { useLayoutEffect, useState, type RefObject } from 'react';

type Hole = { x: number; y: number; w: number; h: number };

/** Padding around each target, and the corner radius of its hole. */
const PAD = 4;
const RADIUS = 8;

export function Spotlight({
  root,
  targets,
  keep = [],
}: {
  /** The area to dim (the battle screen). */
  root: RefObject<HTMLElement | null>;
  /** The `data-spot` keys to point at: lit, with a ring. Nothing renders when empty. */
  targets: readonly string[];
  /** Keys that stay lit without a ring while something is pointed at (the instructions). */
  keep?: readonly string[];
}) {
  const [holes, setHoles] = useState<{ w: number; h: number; holes: Hole[]; rings: number } | null>(
    null,
  );
  const key = targets.length ? [...targets, '', ...keep].join('|') : '';

  // Measured every frame while shown: the field animates and the layout settles.
  useLayoutEffect(() => {
    const el = root.current;
    if (!el || !key) return;
    let frame = 0;
    const measure = () => {
      const box = el.getBoundingClientRect();
      const found: Hole[] = [];
      // Targets come before the empty separator; the kept keys after it.
      const keys = key.split('|');
      let rings = 0;
      for (const t of keys) {
        if (!t) {
          rings = found.length;
          continue;
        }
        for (const node of el.querySelectorAll(`[data-spot="${CSS.escape(t)}"]`)) {
          const r = node.getBoundingClientRect();
          if (r.width && r.height)
            found.push({
              x: r.left - box.left - PAD,
              y: r.top - box.top - PAD,
              w: r.width + 2 * PAD,
              h: r.height + 2 * PAD,
            });
        }
      }
      setHoles((prev) => {
        const next = { w: box.width, h: box.height, holes: found, rings };
        return prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
      });
      frame = requestAnimationFrame(measure);
    };
    measure();
    return () => cancelAnimationFrame(frame);
  }, [root, key]);

  if (!key || !holes) return null;
  // A rounded rectangle; the corners shrink to fit a thin target (an HP bar).
  const rect = (h: Hole) => {
    const r = Math.min(RADIUS, h.w / 2, h.h / 2);
    return (
      `M${h.x + r},${h.y}h${h.w - 2 * r}a${r},${r} 0 0 1 ${r},${r}` +
      `v${h.h - 2 * r}a${r},${r} 0 0 1 -${r},${r}h-${h.w - 2 * r}` +
      `a${r},${r} 0 0 1 -${r},-${r}v-${h.h - 2 * r}a${r},${r} 0 0 1 ${r},-${r}z`
    );
  };
  return (
    <svg
      aria-hidden
      className="animate-fade-in pointer-events-none absolute inset-0 z-30"
      width={holes.w}
      height={holes.h}
    >
      <path
        className="spotlight-dim"
        fillRule="evenodd"
        d={`M0,0h${holes.w}v${holes.h}h-${holes.w}z${holes.holes.map(rect).join('')}`}
      />
      {holes.holes.slice(0, holes.rings).map((h, i) => (
        <path key={i} className="spotlight-ring" fill="none" strokeWidth={2.5} d={rect(h)} />
      ))}
    </svg>
  );
}
