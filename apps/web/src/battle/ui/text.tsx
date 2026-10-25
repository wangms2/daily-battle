import { Fragment, useLayoutEffect, useRef } from 'react';
import { lineKind } from './lineKind';

/** Renders battle text, where `**x**` marks bold (Showdown's log markup). */
export function BattleText({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? <strong key={i}>{p}</strong> : <Fragment key={i}>{p}</Fragment>,
      )}
    </>
  );
}

/**
 * Small print stays on one line: if it would wrap, it shrinks a little (down to
 * about three quarters of its size, then it wraps after all).
 */
function useOneLine(on: boolean) {
  const ref = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!on || !el) return;
    const fit = () => {
      el.style.fontSize = '';
      const start = parseFloat(getComputedStyle(el).fontSize);
      const lineHeight = () => parseFloat(getComputedStyle(el).lineHeight);
      let size = start;
      while (el.clientHeight > lineHeight() * 1.5 && size > start * 0.75) {
        size -= 0.5;
        el.style.fontSize = `${size}px`;
      }
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [on]);
  return ref;
}

/** One line of the log, sized and spaced by how much it matters (see `lineKind`). */
export function BattleLine({ text }: { text: string }) {
  const kind = lineKind(text);
  const ref = useOneLine(kind === 'minor');
  if (kind === 'turn') {
    return (
      <p className="battle-line" data-kind="turn">
        <span>{text.replace(/=/g, '').trim()}</span>
      </p>
    );
  }
  // The damage dealt, highlighted: "(The opposing X lost 45% of its health!)".
  const parts = kind === 'damage' ? text.split(/([\d.]+%)/) : [text];
  return (
    <p ref={ref} className="battle-line" data-kind={kind}>
      {parts.map((p, i) =>
        i % 2 ? (
          <b key={i} className="battle-pct">
            {p}
          </b>
        ) : (
          <BattleText key={i} text={p} />
        ),
      )}
    </p>
  );
}
