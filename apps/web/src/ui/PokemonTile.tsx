import clsx from 'clsx';
import { useState, type ReactNode } from 'react';
import { speciesInfo } from '../lib/data';
import { getSprite } from '../lib/sprites';
import { TypeBadge } from './bits';
import { InfoIcon, PencilIcon } from './icons';
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
  showName = true,
  infoLabel,
  onEdit,
  editLabel,
  hoverCard,
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
  /** Off for a compact row: the sprite alone (the label still names it). */
  showName?: boolean;
  infoLabel?: string;
  /** A pencil in the corner instead of ⓘ (e.g. change a picked Pokémon's set). */
  onEdit?: () => void;
  editLabel?: string;
  /** A card shown while a mouse is over the tile (desktop); touch ignores it. */
  hoverCard?: ReactNode;
}) {
  const { types } = speciesInfo(species);
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onPointerEnter={(e) => e.pointerType === 'mouse' && setHovered(true)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setHovered(false)}
      className={clsx(
        'card relative flex min-h-0 min-w-0 flex-col transition-[opacity,box-shadow,translate]',
        // A mouse over a tile you can tap lifts it a little.
        onTap && 'tile-hover',
        selected && 'is-selected',
        dimmed && 'opacity-45',
        pop && 'animate-pop',
        // A tile's hover card must sit over the tiles after it.
        hoverCard && hovered && 'z-30',
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
        {showName && (
          <span
            className={clsx(
              'w-full truncate text-center leading-tight font-semibold',
              species.length >= 9 ? 'text-[11.5px] tracking-tight' : 'text-[12.5px]',
            )}
          >
            {species}
          </span>
        )}
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
      {hoverCard && hovered && (
        <div
          role="tooltip"
          className="card pointer-events-none absolute top-full left-1/2 z-30 mt-1 w-56 -translate-x-1/2 p-2.5 text-left shadow-lg"
        >
          {hoverCard}
        </div>
      )}
      {onEdit ? (
        <button
          type="button"
          onClick={onEdit}
          aria-label={editLabel ?? `Change ${species}'s set`}
          className="absolute top-0 right-0 grid size-8 place-items-center rounded-full text-accent hover:text-ink"
        >
          <PencilIcon width={15} height={15} />
        </button>
      ) : (
        onInfo && (
          <button
            type="button"
            onClick={onInfo}
            aria-label={infoLabel ?? `About ${species}`}
            className="absolute top-0 right-0 grid size-8 place-items-center rounded-full text-muted hover:text-ink"
          >
            <InfoIcon width={16} height={16} />
          </button>
        )
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

/**
 * A compact horizontal Pokémon card for wide screens: sprite on the left,
 * name and types on the right, so a whole pool scans like a list. (Its sets and
 * roles are in the details panel beside it.)
 */
export function PokemonRow({
  species,
  onTap,
  onInfo,
  selected = false,
  dimmed = false,
  badge,
  label,
  pop = false,
  active = false,
}: {
  species: string;
  onTap: () => void;
  onInfo: () => void;
  selected?: boolean;
  dimmed?: boolean;
  badge?: ReactNode;
  label: string;
  pop?: boolean;
  /** Shown in the details panel. */
  active?: boolean;
}) {
  const { types } = speciesInfo(species);
  return (
    <div
      className={clsx(
        'card relative min-w-0 transition-[opacity,box-shadow]',
        selected && 'is-selected',
        active && 'outline-2 outline-offset-2 outline-gold',
        dimmed && 'opacity-45',
        pop && 'animate-pop',
      )}
    >
      <button
        type="button"
        onClick={onTap}
        aria-pressed={selected}
        aria-label={label}
        // Low enough that four rows leave the details panel room for a whole set.
        className="flex h-[52px] w-full items-center gap-2 rounded-card pr-8 pl-2 text-left focus-visible:outline-2 focus-visible:outline-accent"
      >
        <span className="grid size-12 shrink-0 place-items-center">
          <img
            src={getSprite(species)}
            alt=""
            draggable={false}
            className="pixelated max-h-12 max-w-12 object-contain"
          />
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-[14px] leading-tight font-semibold">{species}</span>
          <span className="flex gap-0.5">
            {types.map((t) => (
              <TypeBadge key={t} type={t} size="sm" />
            ))}
          </span>
        </span>
      </button>
      {badge && <span className="pointer-events-none absolute top-1 left-1">{badge}</span>}
      <button
        type="button"
        onClick={onInfo}
        aria-label={`About ${species}`}
        className="absolute top-0 right-0 grid size-8 place-items-center rounded-full text-muted hover:text-ink"
      >
        <InfoIcon width={16} height={16} />
      </button>
    </div>
  );
}
