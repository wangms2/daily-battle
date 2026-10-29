// Pick a set for a team member (§12.2a): a tab per set across the top and the
// selected set's full card below (description, moves, item, ability, nature,
// EVs), then one button to confirm. The current set, or else the most common
// one, starts selected, so a single tap confirms it. Nothing scrolls.
import type { SetEntry } from '@daily-battle/data';
import clsx from 'clsx';
import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useDetailCards } from '../ui/useDetailCards';
import {
  abilityInfo,
  formatEvs,
  itemInfo,
  megaFor,
  setsOf,
  shortLabel,
  speciesInfo,
  topSet,
} from '../lib/data';
import { Term } from '../ui/DetailCard';
import { getSprite } from '../lib/sprites';
import { Sheet } from '../ui/Sheet';
import { MoveList } from '../ui/MoveList';
import { Button, TypeBadge } from '../ui/bits';
import { ItemIcon } from '../ui/ItemIcon';
import { FinalStatsRow } from '../ui/StatLines';
import { MegaPreview } from '../ui/MegaPreview';

/**
 * A set's description: two lines, and when it's longer, a tap (or a mouse
 * hover) floats the whole text over it. It never changes the layout, so the
 * sheet never has to scroll.
 */
function Description({ text, lines = 2 }: { text: string; lines?: 1 | 2 }) {
  const { container, isOpen, trigger } = useDetailCards<HTMLDivElement>();
  const [clamped, setClamped] = useState(false);
  const el = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    const p = el.current;
    if (p) setClamped(p.scrollHeight > p.clientHeight + 1);
  }, [text, lines]);
  const shown = clamped && isOpen(0);
  return (
    <div ref={container} className="relative mt-1.5">
      <p
        ref={el}
        {...(clamped ? { ...trigger(0), role: 'button', tabIndex: 0, 'aria-label': text } : {})}
        className={clsx(
          lines === 1 ? 'line-clamp-1' : 'line-clamp-2',
          'text-[14px] leading-snug text-muted',
          clamped && 'cursor-pointer',
        )}
      >
        {text}
        {clamped && <span aria-hidden> …</span>}
      </p>
      {shown && (
        <p
          role="tooltip"
          className="card absolute inset-x-0 -top-1 z-20 p-2.5 text-[14px] leading-snug shadow-lg"
        >
          {text}
        </p>
      )}
    </div>
  );
}

export function SetCard({
  species,
  set,
  badge,
  compact = false,
}: {
  species: string;
  set: SetEntry;
  badge: string | null;
  /** No description: for tight places (the daily brief's change panel). */
  compact?: boolean;
}) {
  return (
    <article
      className={clsx('card flex flex-col', compact ? 'px-2.5 py-2' : 'p-3.5')}
      aria-label={set.label}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className={clsx('display leading-tight', compact ? 'text-[14px]' : 'text-[16px]')}>
          {set.label}
        </h3>
        {badge && (
          <span
            className={clsx(
              'shrink-0 rounded-badge bg-accent-soft px-2 font-semibold text-soft-ink',
              compact ? 'text-[11px]' : 'py-0.5 text-[12px]',
            )}
          >
            {badge}
          </span>
        )}
      </div>
      {/* A Mega set's preview needs the room: one line here, the rest a tap away. */}
      {!compact && (
        <Description key={set.id} text={set.description} lines={megaFor(species, set) ? 1 : 2} />
      )}
      <MoveList moves={set.moves} className={compact ? 'mt-1' : 'mt-2'} compact={compact} />
      {/* Compact: one line; the final stats below stand in for the EV spread. */}
      {compact ? (
        <p className="mt-1.5 truncate text-[13px] font-medium">
          {set.item && (
            <>
              <ItemIcon name={set.item} />
              <Term name={set.item} desc={itemInfo(set.item)} kind="Item" />
              <span className="text-muted"> · </span>
            </>
          )}
          <Term name={set.ability} desc={abilityInfo(set.ability)} kind="Ability" />
          <span className="text-muted"> · {set.nature}</span>
        </p>
      ) : (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-[13px]">
          <dt className="text-muted">Item</dt>
          <dd className="font-medium">
            {set.item ? (
              <>
                <ItemIcon name={set.item} />
                <Term name={set.item} desc={itemInfo(set.item)} kind="Item" />
              </>
            ) : (
              'None'
            )}
          </dd>
          <dt className="text-muted">Ability</dt>
          <dd className="font-medium">
            <Term name={set.ability} desc={abilityInfo(set.ability)} kind="Ability" />
          </dd>
          <dt className="text-muted">Nature</dt>
          <dd className="font-medium">
            {set.nature} · {formatEvs(set.evs)}
          </dd>
        </dl>
      )}
      <FinalStatsRow species={species} set={set} />
      <MegaPreview species={species} set={set} />
    </article>
  );
}

/** The set it starts on: the current one, else the most used. */
export function initialSet(species: string, currentSetId?: string): string {
  const sets = setsOf(species);
  return sets.some((s) => s.id === currentSetId) ? currentSetId! : topSet(species).id;
}

/**
 * A species' sets as tabs over the selected set's card: the body of the set
 * picker, also shown inline (the daily brief's change panel).
 */
export function SetChooser({
  species,
  currentSetId,
  selected,
  onSelect,
  compact = false,
}: {
  species: string;
  currentSetId?: string;
  selected: string;
  onSelect: (setId: string) => void;
  /** Tight places: no header row (the caller shows the types), shorter tabs, no description. */
  compact?: boolean;
}) {
  const sets = setsOf(species);
  const common = topSet(species).id;
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();
  const info = speciesInfo(species);
  const set = sets.find((s) => s.id === selected) ?? sets[0]!;
  const badge = set.id === currentSetId ? 'Current' : set.id === common ? 'Most used' : null;

  // Arrow keys move between tabs (WAI-ARIA tabs pattern).
  const onKey = (e: KeyboardEvent, i: number) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + sets.length) % sets.length;
    onSelect(sets[next]!.id);
    tabs.current[next]?.focus();
  };

  return (
    <>
      {!compact && (
        <div className="mb-2 flex items-center gap-2">
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
      )}
      {sets.length > 1 && (
        <div
          role="tablist"
          aria-label="Sets"
          className={clsx('seg grid gap-1 p-1', compact ? 'mb-1' : 'mb-2')}
          style={{ gridTemplateColumns: `repeat(${sets.length}, minmax(0, 1fr))` }}
        >
          {sets.map((s, i) => (
            <button
              key={s.id}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${id}-tab-${s.id}`}
              aria-selected={s.id === set.id}
              aria-controls={`${id}-panel`}
              aria-label={s.label}
              tabIndex={s.id === set.id ? 0 : -1}
              onClick={() => onSelect(s.id)}
              onKeyDown={(e) => onKey(e, i)}
              className={clsx(
                'flex items-center justify-center rounded-[6px] px-1.5 py-1 text-center text-[13px] leading-tight font-semibold',
                compact ? 'min-h-8' : 'min-h-11',
                s.id === set.id ? 'bg-surface text-ink shadow-card' : 'text-muted',
              )}
            >
              <span className="line-clamp-2" title={s.label}>
                {shortLabel(s.label)}
              </span>
            </button>
          ))}
        </div>
      )}
      <div
        role={sets.length > 1 ? 'tabpanel' : undefined}
        id={`${id}-panel`}
        aria-labelledby={sets.length > 1 ? `${id}-tab-${set.id}` : undefined}
      >
        <SetCard species={species} set={set} badge={badge} compact={compact} />
      </div>
    </>
  );
}

export function SetPicker({
  species,
  open,
  onOpenChange,
  currentSetId,
  onChoose,
  onRemove,
  chooseLabel = 'Use this set',
  title,
  blocked,
}: {
  species: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The set it has now, if any; it starts selected. */
  currentSetId?: string;
  /** Omit for a read-only view. */
  onChoose?: (setId: string) => void;
  onRemove?: () => void;
  chooseLabel?: string;
  title?: string;
  /** Why a set can't be chosen (one Mega per team), if it can't. */
  blocked?: (setId: string) => string | undefined;
}) {
  const [selected, setSelected] = useState(() =>
    species ? initialSet(species, currentSetId) : '',
  );

  if (!species) return null;
  const sets = setsOf(species);
  const set = sets.find((s) => s.id === selected) ?? sets[0]!;
  const unchanged = set.id === currentSetId;
  const why = unchanged ? undefined : blocked?.(set.id);

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title ?? `${species} · pick a set`}>
      <SetChooser
        species={species}
        currentSetId={currentSetId}
        selected={set.id}
        onSelect={setSelected}
      />
      {onChoose && (
        <>
          <Button
            className="mt-2 h-12 w-full"
            disabled={unchanged || !!why}
            onClick={() => onChoose(set.id)}
          >
            {unchanged ? 'Current set' : chooseLabel}
          </Button>
          {why && (
            <p role="status" className="mt-1 text-center text-[13px] font-semibold text-bad">
              {why}
            </p>
          )}
        </>
      )}
      {onRemove && (
        <div className="mt-1 flex justify-center">
          <Button variant="ghost" className="text-bad" onClick={onRemove}>
            Remove from team
          </Button>
        </div>
      )}
    </Sheet>
  );
}
