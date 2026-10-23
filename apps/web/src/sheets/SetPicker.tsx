// Pick a set for a team member (§12.2a): a tab per set across the top and the
// selected set's full card below (description, moves, item, ability, nature,
// EVs), then one button to confirm. The current set, or else the most common
// one, starts selected, so a single tap confirms it. Nothing scrolls.
import type { SetEntry } from '@daily-battle/data';
import clsx from 'clsx';
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  abilityInfo,
  formatEvs,
  itemInfo,
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

/**
 * A set's description: two lines, and the rest on a tap (or on hover, in the
 * tooltip) when it's longer, so no sheet has to scroll.
 */
function Description({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [clamped, setClamped] = useState(false);
  const el = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    const p = el.current;
    if (p && !open) setClamped(p.scrollHeight > p.clientHeight + 1);
  }, [text, open]);
  const tall = clamped || open;
  return (
    <p
      ref={el}
      title={tall ? text : undefined}
      role={tall ? 'button' : undefined}
      tabIndex={tall ? 0 : undefined}
      aria-expanded={tall ? open : undefined}
      onClick={tall ? () => setOpen(!open) : undefined}
      onKeyDown={
        tall
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setOpen(!open);
              }
            }
          : undefined
      }
      className={clsx(
        'mt-1.5 text-[14px] leading-snug text-muted',
        !open && 'line-clamp-2',
        tall && 'cursor-pointer',
      )}
    >
      {text}
    </p>
  );
}

function SetCard({
  species,
  set,
  badge,
}: {
  species: string;
  set: SetEntry;
  badge: string | null;
}) {
  return (
    <article className="card flex flex-col p-3.5" aria-label={set.label}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="display text-[16px] leading-tight">{set.label}</h3>
        {badge && (
          <span className="shrink-0 rounded-badge bg-accent-soft px-2 py-0.5 text-[12px] font-semibold text-soft-ink">
            {badge}
          </span>
        )}
      </div>
      <Description key={set.id} text={set.description} />
      <MoveList moves={set.moves} className="mt-2" />
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
      <FinalStatsRow species={species} set={set} />
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
  chooseLabel = 'Use this set',
  title,
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
}) {
  const sets = species ? setsOf(species) : [];
  const common = species && sets.length ? topSet(species).id : undefined;
  const [selected, setSelected] = useState(
    sets.some((s) => s.id === currentSetId) ? currentSetId! : common,
  );
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  if (!species) return null;
  const info = speciesInfo(species);
  const set = sets.find((s) => s.id === selected) ?? sets[0]!;
  const badge = set.id === currentSetId ? 'Current' : set.id === common ? 'Most used' : null;
  const unchanged = set.id === currentSetId;

  // Arrow keys move between tabs (WAI-ARIA tabs pattern).
  const onKey = (e: KeyboardEvent, i: number) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + sets.length) % sets.length;
    setSelected(sets[next]!.id);
    tabs.current[next]?.focus();
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={title ?? `${species} · pick a set`}
      scroll
    >
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
      {sets.length > 1 && (
        <div
          role="tablist"
          aria-label="Sets"
          className="mb-2 grid gap-1 rounded-btn bg-surface-2 p-1"
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
              id={`set-tab-${s.id}`}
              aria-selected={s.id === set.id}
              aria-controls="set-panel"
              aria-label={s.label}
              tabIndex={s.id === set.id ? 0 : -1}
              onClick={() => setSelected(s.id)}
              onKeyDown={(e) => onKey(e, i)}
              className={clsx(
                'flex min-h-11 items-center justify-center rounded-[6px] px-1.5 py-1 text-center text-[13px] leading-tight font-semibold',
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
        id="set-panel"
        aria-labelledby={sets.length > 1 ? `set-tab-${set.id}` : undefined}
      >
        <SetCard species={species} set={set} badge={badge} />
      </div>
      {onChoose && (
        <Button className="mt-2 h-12 w-full" disabled={unchanged} onClick={() => onChoose(set.id)}>
          {unchanged ? 'Current set' : chooseLabel}
        </Button>
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
