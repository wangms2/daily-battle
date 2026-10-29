// What you can learn about an opponent before the battle: the same facts its
// card shows in battle (types, abilities, base stats, Showdown's Speed range,
// and with Beginner hints its likely moves), never one of its sets.
import clsx from 'clsx';
import type { ReactNode } from 'react';
import {
  abilityInfo,
  canMega,
  likelyMoves,
  matchups,
  setsOf,
  speciesInfo,
  STAT_LABEL,
} from '../lib/data';
import { getSprite } from '../lib/sprites';
import { STAT_IDS } from '../lib/stats';
import { foeSpeed, showdownRange } from '../lib/speed';
import { MatchupRow } from '../sheets/InfoSheet';
import { TypeBadge } from './bits';
import { Term } from './DetailCard';
import { MoveChips } from './MoveList';

/** A labelled row, label on the left (as the matchup rows are), to keep it short. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[4.5rem_1fr] items-start gap-2">
      <span className="pt-0.5 text-muted">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
export function FoeScout({
  species,
  hints,
  compact,
}: {
  species: string;
  /** Beginner hints: its likely moves, and its Speed from this game's sets. */
  hints: boolean;
  /** The edit-team scout: just the Speed range, no notes under it. */
  compact?: boolean;
}) {
  const info = speciesInfo(species);
  const m = matchups(species);
  const sets = hints ? setsOf(species) : [];
  const speed = foeSpeed(species, sets, {});
  const sd = showdownRange(info.baseStats.spe);
  const likely = hints ? likelyMoves(sets, [], 6) : [];

  return (
    <div className="grid gap-2 text-[13px]">
      <div className="flex items-center gap-3">
        <img
          src={getSprite(species)}
          alt=""
          className="pixelated size-14 shrink-0 object-contain"
        />
        <div className="min-w-0 space-y-1">
          <div className="flex gap-1">
            {info.types.map((t) => (
              <TypeBadge key={t} type={t} />
            ))}
          </div>
          <p className="text-muted">
            {'Ability: '}
            {info.abilities.map((a, i) => (
              <span key={a}>
                {i > 0 && ' or '}
                <Term name={a} desc={abilityInfo(a)} kind="Ability" />
              </span>
            ))}
            {hints && canMega(species) && (
              <span className="font-semibold text-ink"> · Can Mega Evolve</span>
            )}
          </p>
        </div>
      </div>

      <Row label="Base stats">
        <dl className="flex justify-between gap-1 tabular-nums" aria-label="Base stats">
          {STAT_IDS.map((k) => (
            <div key={k} className="flex flex-col items-center leading-tight">
              <dt className="text-[10.5px] text-muted">{STAT_LABEL[k]}</dt>
              <dd className={clsx(info.baseStats[k] >= 100 && 'font-bold')}>{info.baseStats[k]}</dd>
            </div>
          ))}
        </dl>
      </Row>

      <Row label="Speed">
        <p className="tabular-nums" aria-label="Speed range">
          <span className="font-semibold">{sd[0]}</span>
          <span className="text-muted">
            –{sd[1]}–{sd[2]}–
          </span>
          <span className="font-semibold">{sd[3]}</span>
          {!compact && (
            <span className="text-[11.5px] text-muted"> before boosts, items, abilities</span>
          )}
        </p>
        {hints && !compact && sets.length > 0 && (
          <p className="tabular-nums">
            <span className="text-muted">Its sets here </span>
            <span className="font-semibold">
              {speed.lo === speed.hi ? speed.lo : `${speed.lo}–${speed.hi}`}
            </span>
            {speed.scarf && <span className="text-muted"> · Scarf {speed.scarf}</span>}
          </p>
        )}
      </Row>

      {likely.length > 0 && (
        <Row label="Likely">
          <MoveChips moves={likely} />
        </Row>
      )}

      <MatchupRow
        label="Weak to"
        types={m.weak.map((w) => w.type)}
        extra={(t) => (m.weak.find((w) => w.type === t)!.mult === 4 ? '×4' : '')}
      />
      <MatchupRow label="Resists" types={m.resist.map((r) => r.type)} />
      {m.immune.length > 0 && <MatchupRow label="Immune" types={m.immune} />}
    </div>
  );
}
