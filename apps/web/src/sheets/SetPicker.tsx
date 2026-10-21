// Pick a set for a team member (§12.2a): role cards you swipe through on
// phones, side by side on wide screens. "Details" flips a card to show item,
// ability, nature, and EVs, so nothing has to scroll.
import type { SetEntry } from '@daily-battle/data';
import clsx from 'clsx';
import useEmblaCarousel from 'embla-carousel-react';
import { useEffect, useState } from 'react';
import { formatEvs, setsOf, speciesInfo } from '../lib/data';
import { getSprite } from '../lib/sprites';
import { Sheet } from '../ui/Sheet';
import { Button, TypeBadge } from '../ui/bits';
import { useWide } from '../ui/useWide';

function SetCard({
  set,
  current,
  chooseLabel,
  onChoose,
}: {
  set: SetEntry;
  current: boolean;
  chooseLabel: string | null;
  onChoose: () => void;
}) {
  const [flipped, setFlipped] = useState(false);
  return (
    <article
      className={clsx('card flex h-full flex-col p-4', current && 'is-selected')}
      aria-label={set.label}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="display text-[16px] leading-tight">{set.label}</h3>
        {current && (
          <span className="shrink-0 rounded-badge bg-accent-soft px-2 py-0.5 text-[12px] font-semibold text-soft-ink">
            Current
          </span>
        )}
      </div>
      <div className="mt-2 min-h-0 flex-1">
        {!flipped ? (
          <>
            <p className="line-clamp-3 text-[14px] leading-snug text-muted">{set.description}</p>
            <ul className="mt-3 grid grid-cols-2 gap-1.5">
              {set.moves.map((m) => (
                <li
                  key={m}
                  className="truncate rounded-badge bg-surface-2 px-2.5 py-2 text-[13px] font-medium"
                  title={m}
                >
                  {m}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[14px]">
            <dt className="text-muted">Item</dt>
            <dd className="font-medium">{set.item || 'None'}</dd>
            <dt className="text-muted">Ability</dt>
            <dd className="font-medium">{set.ability}</dd>
            <dt className="text-muted">Nature</dt>
            <dd className="font-medium">{set.nature}</dd>
            <dt className="text-muted">EVs</dt>
            <dd className="font-medium">{formatEvs(set.evs)}</dd>
          </dl>
        )}
      </div>
      <div className="mt-3 flex gap-2">
        <Button
          variant="secondary"
          className="flex-1"
          onClick={() => setFlipped((f) => !f)}
          aria-pressed={flipped}
        >
          {flipped ? 'Moves' : 'Details'}
        </Button>
        {chooseLabel && (
          <Button className="flex-1" onClick={onChoose} disabled={current}>
            {current ? 'Chosen' : chooseLabel}
          </Button>
        )}
      </div>
    </article>
  );
}

export function SetPicker({
  species,
  open,
  onOpenChange,
  currentSetId,
  onChoose,
  onRemove,
  chooseLabel = 'Choose',
  title,
}: {
  species: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentSetId?: string;
  /** Omit for a read-only view. */
  onChoose?: (setId: string) => void;
  onRemove?: () => void;
  chooseLabel?: string;
  title?: string;
}) {
  const wide = useWide();
  const sets = species ? setsOf(species) : [];
  const startIndex = Math.max(
    0,
    sets.findIndex((s) => s.id === currentSetId),
  );
  const [emblaRef, embla] = useEmblaCarousel({
    align: 'start',
    startIndex,
    containScroll: 'trimSnaps',
  });
  const [index, setIndex] = useState(startIndex);
  useEffect(() => {
    if (!embla) return;
    const on = () => setIndex(embla.selectedScrollSnap());
    embla.on('select', on);
    return () => void embla.off('select', on);
  }, [embla]);

  if (!species) return null;
  const info = speciesInfo(species);
  const card = (set: SetEntry) => (
    <SetCard
      set={set}
      current={set.id === currentSetId}
      chooseLabel={onChoose ? chooseLabel : null}
      onChoose={() => onChoose?.(set.id)}
    />
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title ?? `${species} · pick a set`} wide>
      <div className="mb-3 flex items-center gap-2">
        <img
          src={getSprite(species, 'icon')}
          alt=""
          className="pixelated h-8 w-10 object-contain"
        />
        {info.types.map((t) => (
          <TypeBadge key={t} type={t} />
        ))}
        <span className="ml-auto text-[13px] text-muted">
          {sets.length} set{sets.length === 1 ? '' : 's'}
        </span>
      </div>
      {wide ? (
        <div className="grid auto-cols-fr grid-flow-col gap-3 pb-1">
          {sets.map((s) => (
            <div key={s.id} className="h-[300px]">
              {card(s)}
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="-mx-5 overflow-hidden px-5" ref={emblaRef}>
            <div className="flex gap-3">
              {sets.map((s) => (
                <div
                  key={s.id}
                  className={clsx(
                    'h-[290px] shrink-0',
                    sets.length > 1 ? 'basis-[86%]' : 'basis-full',
                  )}
                >
                  {card(s)}
                </div>
              ))}
            </div>
          </div>
          {sets.length > 1 && (
            <div className="mt-3 flex justify-center gap-2" role="tablist" aria-label="Sets">
              {sets.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={i === index}
                  aria-label={s.label}
                  onClick={() => embla?.scrollTo(i)}
                  className={clsx(
                    'h-2 rounded-full transition-all',
                    i === index ? 'w-5 bg-accent' : 'w-2 bg-line',
                  )}
                />
              ))}
            </div>
          )}
        </>
      )}
      {onRemove && (
        <div className="mt-2 flex justify-center">
          <Button variant="ghost" className="text-bad" onClick={onRemove}>
            Remove from team
          </Button>
        </div>
      )}
    </Sheet>
  );
}
