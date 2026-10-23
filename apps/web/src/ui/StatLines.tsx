// Six stat rows: the base stat with its bar and, when a set is known, the final
// stat at level 100 (what the battle uses, with the set's nature and EVs).
import type { SetEntry } from '@daily-battle/data';
import { speciesInfo, STAT_LABEL } from '../lib/data';
import { finalStats, STAT_IDS } from '../lib/stats';

/** The top of the bars: a stat of 160 fills one. */
export const MAX_STAT = 160;

export function StatLines({
  species,
  set,
  compact = false,
  label = 'Stats',
}: {
  species: string;
  /** With a set, each row also shows the final stat. */
  set?: SetEntry;
  compact?: boolean;
  label?: string;
}) {
  const base = speciesInfo(species).baseStats;
  const final = set ? finalStats(base, set) : null;
  return (
    <dl className={compact ? 'space-y-1' : 'mt-4 space-y-1'} aria-label={label}>
      {final && (
        <div
          className="grid grid-cols-[2.5rem_2rem_1fr_2.5rem] items-center gap-2 text-[11px] text-muted"
          aria-hidden
        >
          <span />
          <span className="text-right">Base</span>
          <span />
          <span className="text-right">Final</span>
        </div>
      )}
      {STAT_IDS.map((k) => {
        const v = base[k] ?? 0;
        return (
          <div
            key={k}
            className={
              final
                ? 'grid grid-cols-[2.5rem_2rem_1fr_2.5rem] items-center gap-2 text-[13px]'
                : 'grid grid-cols-[2.5rem_2rem_1fr] items-center gap-2 text-[13px]'
            }
          >
            <dt className="text-muted">{STAT_LABEL[k]}</dt>
            <dd className="text-right font-semibold tabular-nums">
              <span className="sr-only">Base </span>
              {v}
            </dd>
            <dd className="h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, (100 * v) / MAX_STAT)}%`,
                  background: v >= 100 ? 'var(--gold)' : v >= 70 ? 'var(--accent)' : 'var(--muted)',
                }}
              />
            </dd>
            {final && (
              <dd className="text-right font-bold tabular-nums">
                <span className="sr-only">Final </span>
                {final[k]}
              </dd>
            )}
          </div>
        );
      })}
    </dl>
  );
}

/** The six final stats on one line, for tight places (the set picker). */
export function FinalStatsRow({ species, set }: { species: string; set: SetEntry }) {
  const final = finalStats(speciesInfo(species).baseStats, set);
  return (
    <dl
      className="mt-2 flex justify-between gap-1 rounded-chip bg-surface-2 px-2 py-1 text-[12px] whitespace-nowrap"
      aria-label="Final stats at level 100"
    >
      {STAT_IDS.map((k) => (
        <div key={k} className="flex gap-1">
          <dt className="text-muted">{STAT_LABEL[k]}</dt>
          <dd className="font-bold tabular-nums">{final[k]}</dd>
        </div>
      ))}
    </dl>
  );
}
