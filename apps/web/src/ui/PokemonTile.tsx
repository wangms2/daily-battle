import clsx from 'clsx';
import { useState, type ReactNode } from 'react';
import { speciesInfo } from '../lib/data';
import { getSprite } from '../lib/sprites';
import { TypeBadge } from './bits';
import { InfoIcon } from './icons';
import { useMediaQuery } from './useWide';

/**
 * A Pokémon card that fills whatever grid cell it's given: the sprite takes
 * the free space, so tiles shrink to fit small screens without scrolling.
 */
export function PokemonTile({
  species,
  onTap,
  onInfo,
  selected = false,
  dimmed = false,
  badge,
  footer,
  label,
  pop = false,
  showTypes = true,
  infoLabel,
}: {
  species: string;
  onTap?: () => void;
  onInfo?: () => void;
  selected?: boolean;
  dimmed?: boolean;
  /** Top-left corner content (slot number, lead star). */
  badge?: ReactNode;
  /** Extra content under the name (role tag, edit buttons). */
  footer?: ReactNode;
  /** Accessible label for the tap action. */
  label: string;
  pop?: boolean;
  showTypes?: boolean;
  infoLabel?: string;
}) {
  const { types } = speciesInfo(species);
  return (
    <div
      className={clsx(
        'card relative flex min-h-0 min-w-0 flex-col transition-[opacity,box-shadow]',
        selected && 'is-selected',
        dimmed && 'opacity-45',
        pop && 'animate-pop',
      )}
    >
      <button
        type="button"
        onClick={onTap}
        aria-pressed={onTap ? selected : undefined}
        aria-label={label}
        className="flex min-h-0 flex-1 flex-col items-center justify-end gap-0.5 rounded-card px-1 pt-1 pb-1.5 focus-visible:outline-2 focus-visible:outline-accent"
      >
        <span className="flex min-h-0 w-full flex-1 items-center justify-center">
          <Sprite species={species} />
        </span>
        <span
          className={clsx(
            'w-full truncate text-center leading-tight font-semibold',
            species.length >= 9 ? 'text-[11.5px] tracking-tight' : 'text-[12.5px]',
          )}
        >
          {species}
        </span>
        {showTypes && (
          <span className="flex gap-0.5">
            {types.map((t) => (
              <TypeBadge key={t} type={t} size="sm" />
            ))}
          </span>
        )}
      </button>
      {footer}
      {badge && <span className="pointer-events-none absolute top-1 left-1">{badge}</span>}
      {onInfo && (
        <button
          type="button"
          onClick={onInfo}
          aria-label={infoLabel ?? `About ${species}`}
          className="absolute top-0 right-0 grid size-8 place-items-center rounded-full text-muted hover:text-ink"
        >
          <InfoIcon width={16} height={16} />
        </button>
      )}
    </div>
  );
}

/**
 * A front sprite at a multiple of its natural size (bigger on big screens),
 * shrinking to fit its box. Scaling from natural size keeps Pokémon sizes
 * relative to each other, and nothing gets cropped.
 */
function Sprite({ species }: { species: string }) {
  const big = useMediaQuery('(min-width: 640px)');
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const scale = big ? 1.5 : 1;
  return (
    <img
      src={getSprite(species)}
      alt=""
      draggable={false}
      onLoad={(e) =>
        setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
      }
      style={natural ? { width: natural.w * scale, height: natural.h * scale } : undefined}
      className="pixelated max-h-full max-w-full object-contain"
    />
  );
}

export function SlotBadge({ n }: { n: number }) {
  return (
    <span className="grid size-5 place-items-center rounded-badge bg-accent text-[11px] font-bold text-on-accent">
      {n}
    </span>
  );
}
