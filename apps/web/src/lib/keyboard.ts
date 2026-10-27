// The on-screen keyboard's height, as the CSS variable --kb on <html>. iOS lays the
// keyboard over the page instead of shrinking it, so whatever sits at the bottom
// (the name card, a sheet with a text field) would end up behind it; those lift
// themselves by --kb (styles.css). Android resizes the page itself
// (interactive-widget in index.html), so --kb stays 0 there.

/** How much of the layout viewport the keyboard covers, in px. */
export function keyboardInset(
  innerHeight: number,
  viewport: { height: number; offsetTop: number },
): number {
  // Small differences are browser chrome (the URL bar), not a keyboard.
  const covered = innerHeight - viewport.height - viewport.offsetTop;
  return covered > 80 ? Math.round(covered) : 0;
}

/** Keeps --kb up to date; returns the cleanup. */
export function trackKeyboard(win: Window = window): () => void {
  const vv = win.visualViewport;
  if (!vv) return () => {};
  const root = win.document.documentElement;
  const update = () => {
    const inset = keyboardInset(win.innerHeight, vv);
    root.style.setProperty('--kb', `${inset}px`);
    // While it's open, tall cards scroll (and Pikachu over the name card steps aside).
    root.classList.toggle('kb-open', inset > 0);
  };
  update();
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  return () => {
    vv.removeEventListener('resize', update);
    vv.removeEventListener('scroll', update);
  };
}
