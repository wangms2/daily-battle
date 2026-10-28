// Six stat rows: the base stat with its bar and, when a set is known, the final
// stat at level 100 (what the battle uses, with the set's nature and EVs).
import type { SetEntry } from '@daily-battle/data';
import { megaFor, speciesInfo, STAT_LABEL } from '../lib/data';
import clsx from 'clsx';
import { finalStats, STAT_IDS } from '../lib/stats';

/** The top of the bars: a base stat of 160 fills one. */
export const MAX_STAT = 160;
/** With a set, the bars show the final stat (what the battle uses): 450 fills one. */
const MAX_FINAL = 450;

/** A bar's width and colour: high stats gold, middling ones accent, low ones muted. */
function bar(v: number, f: number | undefined) {
  const [x, max, high, mid] = f === undefined ? [v, MAX_STAT, 100, 70] : [f, MAX_FINAL, 300, 220];
  return {
    width: `${Math.min(100, (100 * x) / max)}%`,
    background: x >= high ? 'var(--gold)' : x >= mid ? 'var(--accent)' : 'var(--muted)',
  };
}

export function StatLines({
  species,
  set,
  compact = false,
  withMega = false,
  label = 'Stats',
}: {
  species: string;
  /** With a set, each row also shows the final stat. */
  set?: SetEntry;
  compact?: boolean;
  /** A Mega set: a third column with the Mega's final stats. */
  withMega?: boolean;
  label?: string;
}) {
  const base = speciesInfo(species).baseStats;
  const final = set ? finalStats(base, set) : null;
  const mega = withMega && set ? megaFor(species, set) : undefined;
  const megaFinal = mega && set ? finalStats(speciesInfo(mega.forme).baseStats, set) : null;
  const cols = megaFinal
    ? 'grid-cols-[2rem_1.75rem_1fr_2rem_2rem] gap-1.5'
    : final
      ? 'grid-cols-[2.5rem_2rem_1fr_2.5rem] gap-2'
      : 'grid-cols-[2.5rem_2rem_1fr] gap-2';
  return (
    <dl className={compact ? 'space-y-0.5' : 'mt-4 space-y-1'} aria-label={label}>
      {final && (
        <div className={clsx('grid items-center text-[11px] text-muted', cols)} aria-hidden>
          <span />
          <span className="text-right">Base</span>
          <span />
          <span className="text-right">Final</span>
          {megaFinal && (
            <span className="text-right">
              <span className="mega-badge rounded-[3px] px-1 text-[10px] font-bold">Mega</span>
            </span>
          )}
        </div>
      )}
      {STAT_IDS.map((k) => {
        const v = base[k] ?? 0;
        return (
          <div key={k} className={clsx('grid items-center text-[13px]', cols)}>
            <dt className="text-muted">{STAT_LABEL[k]}</dt>
            <dd className="text-right font-semibold tabular-nums">
              <span className="sr-only">Base </span>
              {v}
            </dd>
            <dd className="h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
              <div className="h-full rounded-full" style={bar(v, final?.[k])} />
            </dd>
            {final && (
              <dd className="text-right font-bold tabular-nums">
                <span className="sr-only">Final </span>
                {final[k]}
              </dd>
            )}
            {megaFinal && (
              <dd className="text-right font-bold tabular-nums">
                <span className="sr-only">Mega </span>
                {megaFinal[k]}
              </dd>
            )}
          </div>
        );
      })}
    </dl>
  );
}

/** The six final stats on one line, for tight places (the set picker). */
export function FinalStatsRow({
  species,
  set,
  label = 'Final stats at level 100',
}: {
  species: string;
  set: SetEntry;
  label?: string;
}) {
  const final = finalStats(speciesInfo(species).baseStats, set);
  return (
    <dl
      className="mt-2 flex justify-between gap-0.5 rounded-chip bg-surface-2 px-1.5 py-1 text-[12px] whitespace-nowrap"
      aria-label={label}
    >
      {STAT_IDS.map((k) => (
        <div key={k} className="flex gap-[3px]">
          <dt className="text-[10.5px] leading-[18px] text-muted">{STAT_LABEL[k]}</dt>
          <dd className="font-bold tabular-nums">{final[k]}</dd>
        </div>
      ))}
    </dl>
  );
}
