// What a Pokémon is good for, before you commit to it. For the opponent it
// shows species facts only: never sets or usage.
import { matchups, setsOf, speciesInfo, STAT_LABEL } from '../lib/data';
import { getSprite } from '../lib/sprites';
import { Sheet } from '../ui/Sheet';
import { Button, TypeBadge } from '../ui/bits';

const MAX_STAT = 160;

export function InfoSheet({
  species,
  open,
  onOpenChange,
  showRoles = true,
  action,
}: {
  species: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Off for opponents: their sets are hidden. */
  showRoles?: boolean;
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

      <dl className="mt-4 space-y-1">
        {Object.entries(info.baseStats).map(([k, v]) => (
          <div key={k} className="grid grid-cols-[2.5rem_2rem_1fr] items-center gap-2 text-[13px]">
            <dt className="text-muted">{STAT_LABEL[k]}</dt>
            <dd className="text-right font-semibold tabular-nums">{v}</dd>
            <dd className="h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, (100 * v) / MAX_STAT)}%`,
                  background: v >= 100 ? 'var(--gold)' : v >= 70 ? 'var(--accent)' : 'var(--muted)',
                }}
              />
            </dd>
          </div>
        ))}
      </dl>

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

function MatchupRow({
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
