// A set's four moves as chips. Tapping or clicking one (or hovering it with a
// mouse) shows a small card above it: type, category, power, accuracy, PP,
// and one line on what it does. A tap elsewhere or Escape closes it.
import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { moveInfo } from '../lib/data';
import { TypeBadge } from './bits';

export function MoveList({ moves, className }: { moves: string[]; className?: string }) {
  const [open, setOpen] = useState<{ i: number; pinned: boolean } | null>(null);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open?.pinned) return;
    const away = (e: PointerEvent) => {
      if (!list.current?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, [open?.pinned]);

  return (
    <ul ref={list} className={clsx('grid grid-cols-2 gap-1.5', className)} aria-label="Moves">
      {moves.map((m, i) => {
        const shown = open?.i === i;
        return (
          <li key={m} className="relative min-w-0">
            <button
              type="button"
              aria-expanded={shown}
              aria-describedby={shown ? `move-info-${i}` : undefined}
              onClick={() => setOpen(shown && open.pinned ? null : { i, pinned: true })}
              onPointerEnter={(e) =>
                e.pointerType === 'mouse' && !open?.pinned && setOpen({ i, pinned: false })
              }
              onPointerLeave={(e) => e.pointerType === 'mouse' && !open?.pinned && setOpen(null)}
              onKeyDown={(e) => {
                // Close the card, not the sheet around it.
                if (e.key === 'Escape' && open) {
                  e.stopPropagation();
                  setOpen(null);
                }
              }}
              className={clsx(
                'w-full truncate rounded-badge px-2.5 py-1.5 text-left text-[13px] font-medium',
                shown ? 'bg-accent-soft text-soft-ink' : 'bg-surface-2 hover:bg-accent-soft/60',
              )}
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
    <div
      id={id}
      role="tooltip"
      className={clsx(
        'card absolute bottom-full z-20 mb-1.5 w-64 max-w-[calc(200%+0.375rem)] p-2.5 text-left shadow-lg',
        right ? 'right-0' : 'left-0',
      )}
    >
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
    </div>
  );
}
