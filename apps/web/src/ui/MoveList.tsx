// A set's four moves as chips. Tapping or clicking one (or hovering it with a
// mouse) shows a small card above it: type, category, power, accuracy, PP,
// and one line on what it does. A tap elsewhere or Escape closes it.
import clsx from 'clsx';
import type { CSSProperties } from 'react';
import { moveInfo } from '../lib/data';
import { TYPE_COLORS } from '../lib/types';
import { TypeBadge } from './bits';
import { DetailCardBox } from './DetailCard';
import { useDetailCards } from './useDetailCards';

export function MoveList({ moves, className }: { moves: string[]; className?: string }) {
  const { container, isOpen, trigger } = useDetailCards<HTMLUListElement>();
  return (
    <ul ref={container} className={clsx('grid grid-cols-2 gap-1.5', className)} aria-label="Moves">
      {moves.map((m, i) => {
        const shown = isOpen(i);
        return (
          <li key={m} className="relative min-w-0">
            <button
              type="button"
              {...trigger(i)}
              aria-describedby={shown ? `move-info-${i}` : undefined}
              className="move-chip w-full truncate rounded-badge px-2.5 py-1.5 text-left text-[13px] font-medium"
              style={typeStyle(m)}
            >
              {m}
            </button>
            {shown && <MoveCard id={`move-info-${i}`} name={m} right={i % 2 === 1} />}
          </li>
        );
      })}
    </ul>
  );
}

/** A move's type color as the `--type` the chip styles read. */
const typeStyle = (move: string) =>
  ({ '--type': TYPE_COLORS[moveInfo(move)?.type ?? '']?.bg ?? '#9fa19f' }) as CSSProperties;

/** Moves as small type-tinted chips, without details (battle cards). */
export function MoveChips({ moves, className }: { moves: string[]; className?: string }) {
  return (
    <ul className={clsx('flex flex-wrap gap-1', className)} aria-label="Moves">
      {moves.map((m) => (
        <li
          key={m}
          className="move-chip rounded-badge px-1.5 py-0.5 text-[12px] leading-4 font-medium"
          style={typeStyle(m)}
        >
          {m}
        </li>
      ))}
    </ul>
  );
}

function MoveCard({ id, name, right }: { id: string; name: string; right: boolean }) {
  const move = moveInfo(name);
  if (!move) return null;
  const facts = [
    ['Power', move.power ? String(move.power) : '—'],
    move.accuracy !== true
      ? ['Acc', `${move.accuracy}%`]
      : move.category !== 'Status' && ['Acc', 'Never misses'],
    ['PP', String(move.pp)],
  ].filter((f): f is string[] => !!f);
  const notes = [
    move.priority > 0 && `Priority +${move.priority}`,
    move.priority < 0 && `Priority ${move.priority}`,
    move.contact && 'Contact',
  ].filter(Boolean);
  return (
    <DetailCardBox id={id} right={right} className="max-w-[calc(200%+0.375rem)]">
      <div className="flex items-center gap-1.5">
        <span className="truncate text-[14px] font-semibold">{name}</span>
        <TypeBadge type={move.type} size="sm" />
        <span className="text-[12px] text-muted">{move.category}</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 text-[12px] tabular-nums">
        <dl className="contents">
          {facts.map(([k, v]) => (
            <div key={k} className="flex gap-1">
              <dt className="text-muted">{k}</dt>
              <dd className="font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
        {notes.length > 0 && <span className="text-muted">{notes.join(' · ')}</span>}
      </div>
      <p className="mt-1 text-[13px] leading-snug">{move.desc}</p>
    </DetailCardBox>
  );
}
