// Small pieces the versus screens share: lives as hearts, the standings, and
// a strip of Pokémon icons.
import type { RoomView } from '@daily-battle/versus';
import clsx from 'clsx';
import { getSprite } from '../lib/sprites';
import { placeText, standings } from './standings';

export function Hearts({ lives, max }: { lives: number; max: number }) {
  return (
    <span
      role="img"
      className="inline-flex gap-0.5 text-[14px] leading-none"
      aria-label={`${lives} ${lives === 1 ? 'life' : 'lives'} left`}
    >
      {Array.from({ length: max }, (_, i) => (
        <span key={i} aria-hidden className={i < lives ? 'text-bad' : 'text-line'}>
          ♥
        </span>
      ))}
    </span>
  );
}

export function Standings({ room, you }: { room: RoomView; you: string }) {
  return (
    <ol className="card divide-y divide-line" aria-label="Standings">
      {standings(room.players).map((p) => (
        <li
          key={p.id}
          className={clsx(
            'flex min-h-12 items-center gap-3 px-4 py-2',
            p.place !== null && p.place > 1 && 'text-muted',
          )}
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold">
              {p.name}
              {p.id === you && <span className="font-normal text-muted"> (you)</span>}
            </span>
            <span className="block text-[12px] text-muted">
              {[`${p.wins}–${p.losses}`, p.place !== null && placeText(p.place), p.left && 'Left']
                .filter(Boolean)
                .join(' · ')}
            </span>
          </span>
          <Hearts lives={p.lives} max={room.settings.lives} />
        </li>
      ))}
    </ol>
  );
}

/** A row of Pokémon icons, e.g. the pool or a foe's team. */
export function IconStrip({ species, label }: { species: string[]; label: string }) {
  return (
    <ul className="flex flex-wrap gap-1" aria-label={label}>
      {species.map((s) => (
        <li key={s} title={s}>
          <img src={getSprite(s, 'icon')} alt={s} className="pixelated h-8 w-10 object-contain" />
        </li>
      ))}
    </ul>
  );
}
