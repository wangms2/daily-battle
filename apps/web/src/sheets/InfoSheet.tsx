// What a Pokémon is good for, before you commit to it. An opponent shows what
// its battle card would (FoeScout), never one of its sets.
import { matchups, setsOf, speciesInfo, topSet } from '../lib/data';
import { getSprite } from '../lib/sprites';
import { Sheet } from '../ui/Sheet';
import { Button, TypeBadge } from '../ui/bits';
import { FoeScout } from '../ui/FoeScout';
import { StatLines } from '../ui/StatLines';

export function InfoSheet({
  species,
  open,
  onOpenChange,
  showRoles = true,
  foe,
  action,
}: {
  species: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showRoles?: boolean;
  /** An opponent: what its battle card shows, against your team. */
  foe?: { hints: boolean };
  action?: { label: string; onClick: () => void; disabled?: boolean };
}) {
  if (!species) return null;
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={species}>
      {foe ? (
        <FoeScout species={species} hints={foe.hints} />
      ) : (
        <InfoBody species={species} showRoles={showRoles} />
      )}
      {action && (
        <Button className="mt-5 w-full" onClick={action.onClick} disabled={action.disabled}>
          {action.label}
        </Button>
      )}
    </Sheet>
  );
}

/** A Pokémon's types, stats, roles and matchups: the info sheet's contents (or a panel's). */
export function InfoBody({ species, showRoles = true }: { species: string; showRoles?: boolean }) {
  const info = speciesInfo(species);
  const m = matchups(species);
  const total = Object.values(info.baseStats).reduce((a, b) => a + b, 0);
  return (
    <>
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
    </>
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
