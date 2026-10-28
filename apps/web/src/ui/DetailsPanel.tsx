// Wide team builder: the details of one pool Pokémon under the cards, in place
// of the info sheet and set picker. Its sets are tabs; for a team member, a
// tab is its set, so choosing one changes it right away.
import clsx from 'clsx';
import { useRef, type KeyboardEvent } from 'react';
import {
  abilityInfo,
  formatEvs,
  itemInfo,
  matchups,
  setsOf,
  shortLabel,
  speciesInfo,
  topSet,
} from '../lib/data';
import { useFlavor } from '../lib/flavor';
import { getSprite } from '../lib/sprites';
import { MatchupRow } from '../sheets/InfoSheet';
import { ItemIcon } from './ItemIcon';
import { StatLines } from './StatLines';
import { Term } from './DetailCard';
import { MoveList } from './MoveList';
import { MegaLine } from './MegaPreview';
import { Button, TypeBadge } from './bits';

export function DetailsPanel({
  species,
  setId,
  onSelectSet,
  inTeam,
  full,
  onToggle,
}: {
  species: string | null;
  /** The set shown: the member's own, or the one previewed. */
  setId: string | undefined;
  onSelectSet: (setId: string) => void;
  inTeam: boolean;
  full: boolean;
  onToggle: () => void;
}) {
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const flavor = useFlavor(species);

  if (!species) {
    return (
      <section
        aria-label="Pokémon details"
        className="grid min-h-40 flex-1 place-items-center rounded-card border-2 border-dashed border-line p-4 text-center text-[13px] text-muted"
      >
        Click a Pokémon, or its ⓘ, to see its sets, stats and matchups here.
      </section>
    );
  }

  const info = speciesInfo(species);
  const m = matchups(species);
  const sets = setsOf(species);
  const common = topSet(species).id;
  const set = sets.find((s) => s.id === setId) ?? sets.find((s) => s.id === common)!;

  // Arrow keys move between tabs (WAI-ARIA tabs pattern).
  const onKey = (e: KeyboardEvent, i: number) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + sets.length) % sets.length;
    onSelectSet(sets[next]!.id);
    tabs.current[next]?.focus();
  };

  return (
    <section
      aria-label={`${species} details`}
      // Scrolls inside itself when a tall set doesn't fit beside the pool. `relative`
      // keeps the stat rows' sr-only labels clipped here, not stretching the page.
      className="card relative flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-4"
    >
      <header className="flex items-center gap-2">
        <img
          src={getSprite(species, 'icon')}
          alt=""
          className="pixelated h-8 w-10 object-contain"
        />
        {/* Its Pokédex entry is a hover (or click) on its name: flavour, so it takes no room. */}
        <h2 className="display text-[16px]">
          <Term name={species} desc={flavor} kind="Pokédex" below />
        </h2>
        {info.types.map((t) => (
          <TypeBadge key={t} type={t} />
        ))}
        <span className="ml-1 shrink-0 text-[13px] text-muted">
          {sets.length} set{sets.length === 1 ? '' : 's'}
          {inTeam && ' · pick one to use it'}
        </span>
        <Button
          variant={inTeam ? 'ghost' : 'primary'}
          className={clsx('ml-auto h-9 min-h-9! shrink-0 px-4 text-[14px]', inTeam && 'text-bad')}
          disabled={!inTeam && full}
          onClick={onToggle}
        >
          {inTeam ? 'Remove from team' : full ? 'Team is full' : 'Add to team'}
        </Button>
      </header>

      {sets.length > 1 && (
        <div
          role="tablist"
          aria-label="Sets"
          className="grid gap-1 rounded-btn bg-surface-2 p-1"
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
              id={`panel-tab-${s.id}`}
              aria-selected={s.id === set.id}
              aria-controls="panel-set"
              aria-label={s.label}
              tabIndex={s.id === set.id ? 0 : -1}
              onClick={() => onSelectSet(s.id)}
              onKeyDown={(e) => onKey(e, i)}
              className={clsx(
                'flex min-h-9 items-center justify-center rounded-[6px] px-1.5 py-0.5 text-center text-[13px] leading-tight font-semibold',
                s.id === set.id ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink',
              )}
            >
              {shortLabel(s.label)}
            </button>
          ))}
        </div>
      )}

      <div
        role={sets.length > 1 ? 'tabpanel' : undefined}
        id="panel-set"
        aria-labelledby={sets.length > 1 ? `panel-tab-${set.id}` : undefined}
        className="flex flex-col gap-2.5"
      >
        {/* The set's whole name and description, across the panel. */}
        <p className="text-[13px] leading-snug text-muted">
          <span className="font-semibold text-ink">{set.label}.</span>
          {set.id === common && (
            <span className="mx-1.5 rounded-badge bg-accent-soft px-1.5 py-px text-[11px] font-semibold text-soft-ink">
              Most used
            </span>
          )}{' '}
          {set.description}
        </p>

        <div className="grid grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,0.85fr)] gap-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <MoveList key={set.id} moves={set.moves} />
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-[13px] leading-[19px]">
              <dt className="text-muted">Item</dt>
              <dd className="min-w-0 font-medium">
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
              <dd className="min-w-0 font-medium">
                <Term name={set.ability} desc={abilityInfo(set.ability)} kind="Ability" />
              </dd>
              <MegaLine species={species} set={set} />
            </dl>
          </div>

          {/* The nature and EVs make the final stats, so they head them. A Mega set's
            Mega stats are a column here (its ability is with the set's). */}
          <div className="min-w-0">
            <p className="mb-1 text-[13px] leading-snug">
              <span className="font-medium">{set.nature}</span>
              <span className="text-muted"> · </span>
              {formatEvs(set.evs)}
            </p>
            <StatLines species={species} set={set} compact withMega label="Base and final stats" />
          </div>

          <div className="grid content-start gap-2 text-[13px]">
            <MatchupRow
              label="Weak to"
              types={m.weak.map((w) => w.type)}
              extra={(t) => (m.weak.find((w) => w.type === t)!.mult === 4 ? '×4' : '')}
            />
            <MatchupRow label="Resists" types={m.resist.map((r) => r.type)} />
            {m.immune.length > 0 && <MatchupRow label="Immune" types={m.immune} />}
          </div>
        </div>
      </div>
    </section>
  );
}
