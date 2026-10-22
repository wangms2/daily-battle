// Wide team builder: the details of one pool Pokémon under the cards, in place
// of the info sheet and set picker. Its sets are tabs; for a team member, a
// tab is its set, so choosing one changes it right away.
import clsx from 'clsx';
import { useRef, type KeyboardEvent } from 'react';
import {
  formatEvs,
  matchups,
  setsOf,
  shortLabel,
  speciesInfo,
  STAT_LABEL,
  topSet,
} from '../lib/data';
import { getSprite } from '../lib/sprites';
import { MatchupRow, MAX_STAT } from '../sheets/InfoSheet';
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
    <section aria-label={`${species} details`} className="card flex min-h-0 flex-col gap-3 p-4">
      <header className="flex items-center gap-2">
        <img
          src={getSprite(species, 'icon')}
          alt=""
          className="pixelated h-8 w-10 object-contain"
        />
        <h2 className="display text-[16px]">{species}</h2>
        {info.types.map((t) => (
          <TypeBadge key={t} type={t} />
        ))}
        <span className="ml-1 text-[13px] text-muted">
          {sets.length} set{sets.length === 1 ? '' : 's'}
          {inTeam && ' · pick one to use it'}
        </span>
        <Button
          variant={inTeam ? 'ghost' : 'primary'}
          className={clsx('ml-auto h-9 px-4 text-[14px]', inTeam && 'text-bad')}
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
                'flex h-9 items-center justify-center gap-1 rounded-[6px] px-1.5 text-[13px] font-semibold',
                s.id === set.id ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink',
              )}
            >
              <span className="truncate">{shortLabel(s.label)}</span>
              {s.id === common && (
                <span className="shrink-0 text-[11px] font-medium text-muted">· most used</span>
              )}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] gap-5">
        <div
          role={sets.length > 1 ? 'tabpanel' : undefined}
          id="panel-set"
          aria-labelledby={sets.length > 1 ? `panel-tab-${set.id}` : undefined}
          className="flex min-w-0 flex-col gap-2"
        >
          <p className="line-clamp-2 text-[13px] leading-snug text-muted">
            <span className="font-semibold text-ink">{set.label}.</span> {set.description}
          </p>
          <ul className="grid grid-cols-2 gap-1.5" aria-label="Moves">
            {set.moves.map((mv) => (
              <li
                key={mv}
                className="truncate rounded-badge bg-surface-2 px-2.5 py-1.5 text-[13px] font-medium"
                title={mv}
              >
                {mv}
              </li>
            ))}
          </ul>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[13px]">
            <dt className="text-muted">Item</dt>
            <dd className="truncate font-medium">{set.item || 'None'}</dd>
            <dt className="text-muted">Ability</dt>
            <dd className="truncate font-medium">{set.ability}</dd>
            <dt className="text-muted">Nature</dt>
            <dd className="truncate font-medium">
              {set.nature} · {formatEvs(set.evs)}
            </dd>
          </dl>
        </div>

        <dl className="space-y-1" aria-label="Base stats">
          {Object.entries(info.baseStats).map(([k, v]) => (
            <div
              key={k}
              className="grid grid-cols-[2.25rem_1.75rem_1fr] items-center gap-2 text-[13px]"
            >
              <dt className="text-muted">{STAT_LABEL[k]}</dt>
              <dd className="text-right font-semibold tabular-nums">{v}</dd>
              <dd className="h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, (100 * v) / MAX_STAT)}%`,
                    background:
                      v >= 100 ? 'var(--gold)' : v >= 70 ? 'var(--accent)' : 'var(--muted)',
                  }}
                />
              </dd>
            </div>
          ))}
        </dl>

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
    </section>
  );
}
