import { Fragment } from 'react';

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
