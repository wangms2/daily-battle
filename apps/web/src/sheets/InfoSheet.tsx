// What a Pokémon is good for, before you commit to it. For the opponent it
// shows species facts, plus its possible sets with Beginner hints on; never usage.
import { useState } from 'react';
import {
  abilityInfo,
  itemInfo,
  matchups,
  possibleSets,
  setsOf,
  shortLabel,
  speciesInfo,
  topSet,
} from '../lib/data';
import { getSprite } from '../lib/sprites';
import { Sheet } from '../ui/Sheet';
import { Button, TypeBadge } from '../ui/bits';
import { Term } from '../ui/DetailCard';
import { MoveList } from '../ui/MoveList';
import { StatLines } from '../ui/StatLines';

export function InfoSheet({
  species,
  open,
  onOpenChange,
  showRoles = true,
  showPossibleSets = false,
  action,
}: {
  species: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Off for opponents: their sets are hidden. */
  showRoles?: boolean;
  /** An opponent with Beginner hints on: the sets it might be running. */
  showPossibleSets?: boolean;
  action?: { label: string; onClick: () => void; disabled?: boolean };
}) {
  if (!species) return null;
  const info = speciesInfo(species);
  const m = matchups(species);
  const total = Object.values(info.baseStats).reduce((a, b) => a + b, 0);
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={species}>
      <div className="flex items-center gap-4">
        <img src={getSprite(species)} alt="" className="pixelated h-20 w-20 object-contain" />
        <div className="space-y-2">
          <div className="flex gap-1.5">
            {info.types.map((t) => (
              <TypeBadge key={t} type={t} />
            ))}
          </div>
          <p className="text-[13px] text-muted">
            {info.tier} · Base stat total {total}
          </p>
        </div>
      </div>

      <StatLines species={species} set={showRoles ? topSet(species) : undefined} />
      {showRoles && (
        <p className="mt-1 text-[11px] text-muted">
          Final stats are for the most used set ({topSet(species).label}).
        </p>
      )}

      {showPossibleSets && <PossibleSets key={species} species={species} />}

      {showRoles && (
        <div className="mt-4">
          <h3 className="text-[13px] font-semibold text-muted">Roles</h3>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {setsOf(species).map((s) => (
              <span
                key={s.id}
                className="rounded-full bg-surface-2 px-2.5 py-1 text-[13px] font-medium"
              >
                {s.label}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 grid gap-2 text-[13px]">
        <MatchupRow
          label="Weak to"
          types={m.weak.map((w) => w.type)}
          extra={(t) => (m.weak.find((w) => w.type === t)!.mult === 4 ? '×4' : '')}
        />
        <MatchupRow label="Resists" types={m.resist.map((r) => r.type)} />
        {m.immune.length > 0 && <MatchupRow label="Immune" types={m.immune} />}
      </div>

      {action && (
        <Button className="mt-5 w-full" onClick={action.onClick} disabled={action.disabled}>
          {action.label}
        </Button>
      )}
    </Sheet>
  );
}

export function MatchupRow({
  label,
  types,
  extra,
}: {
  label: string;
  types: string[];
  extra?: (t: string) => string;
}) {
  return (
    <div className="grid grid-cols-[4.5rem_1fr] items-start gap-2">
      <span className="pt-0.5 text-muted">{label}</span>
      <div className="flex flex-wrap gap-1">
        {types.length ? (
          types.map((t) => (
            <span key={t} className="inline-flex items-center gap-0.5">
              <TypeBadge type={t} size="sm" />
              {extra?.(t) && <span className="text-[11px] font-bold text-bad">{extra(t)}</span>}
            </span>
          ))
        ) : (
          <span className="text-muted">None</span>
        )}
      </div>
    </div>
  );
}

/** An opponent's possible sets as tabs, one shown at a time so the sheet stays short. */
function PossibleSets({ species }: { species: string }) {
  const sets = possibleSets(species);
  const [i, setI] = useState(0);
  const set = sets[i] ?? sets[0];
  if (!set) return null;
  return (
    <div className="mt-4">
      <h3 className="text-[13px] font-semibold text-muted">Possible sets</h3>
      <div role="tablist" aria-label="Possible sets" className="mt-1.5 flex flex-wrap gap-1.5">
        {sets.map((s, k) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={k === i}
            onClick={() => setI(k)}
            className={`rounded-full px-2.5 py-1 text-[13px] font-medium ${
              k === i ? 'bg-accent text-on-accent' : 'bg-surface-2'
            }`}
          >
            {shortLabel(s.label)}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-label={set.label} className="mt-2">
        <MoveList moves={set.moves} />
        <p className="mt-1.5 text-[13px] text-muted">
          {set.item && <Term name={set.item} desc={itemInfo(set.item)} kind="Item" />}
          {set.item && ' · '}
          <Term name={set.ability} desc={abilityInfo(set.ability)} kind="Ability" right />
        </p>
      </div>
    </div>
  );
}
