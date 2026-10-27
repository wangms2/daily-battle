// Computers (DESIGN.md §12.2f): from 1100px wide the whole UI grows steadily, about
// 1.1× on a 1280 laptop, 1.35× at 1920, 1.6× at 2560 (a 1440p screen, or 4K at 150%)
// and 2.15× at 3840 (4K unscaled), so text is easy to read and nothing sits small in
// empty space.
// It's CSS zoom on <body> (sheets portal there too), as --z; viewport units are
// divided by it (--vh in styles.css) so full-height screens still fit.

const FROM = 1100;
/** Extra zoom per px of width past FROM. */
const PER_PX = 0.00042;
const MAX = 2.25;

/** The zoom for a window `width` CSS px wide: 1 up to 1100, then growing to 2.25. */
export function uiScale(width: number): number {
  if (width <= FROM) return 1;
  return Math.round(Math.min(MAX, 1 + (width - FROM) * PER_PX) * 20) / 20;
}

/** Keeps the zoom in step with the window; returns the cleanup. */
export function trackUiScale(win: Window = window): () => void {
  const root = win.document.documentElement;
  let last = 0;
  const update = () => {
    // The layout width before our zoom: the window's own width.
    const z = uiScale(win.innerWidth);
    if (z === last) return;
    last = z;
    root.style.setProperty('--z', String(z));
    win.document.body.style.zoom = z === 1 ? '' : String(z);
  };
  update();
  win.addEventListener('resize', update);
  return () => win.removeEventListener('resize', update);
}
