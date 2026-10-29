// What you can learn about an opponent before the battle: the same facts its
// card shows in battle (types, abilities, base stats, Showdown's Speed range,
// and with Beginner hints its likely moves), never one of its sets. Its Speed is
// weighed against each of your six, as the battle card weighs it against the
// one that's out.
import clsx from 'clsx';
import type { ReactNode } from 'react';
import {
  abilityInfo,
  canMega,
  findSet,
  likelyMoves,
  matchups,
  setsOf,
  speciesInfo,
  STAT_LABEL,
  type Slot,
} from '../lib/data';
import { getSprite } from '../lib/sprites';
import { finalStats, STAT_IDS } from '../lib/stats';
import { battleSpeed, foeSpeed, scarfFlips, showdownRange, speedVerdict } from '../lib/speed';
import { MatchupRow } from '../sheets/InfoSheet';
import { TypeBadge } from './bits';
import { Term } from './DetailCard';
import { MoveChips } from './MoveList';

// Grouped as the battle card words it, faster foes first (they're the threat).
const VERDICTS = [
  ['faster', '▲', 'Faster than', 'text-bad'],
  ['either', '◆', 'Possibly faster than', 'text-muted'],
  ['tie', '=', 'Ties with', 'text-muted'],
  ['slower', '▼', 'Slower than', 'text-good'],
] as const;

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
  team,
}: {
  species: string;
  /** Beginner hints: its likely moves, and its Speed from this game's sets. */
  hints: boolean;
  /** Your six, to weigh its Speed against. */
  team: readonly Slot[];
}) {
  const info = speciesInfo(species);
  const m = matchups(species);
  const sets = hints ? setsOf(species) : [];
  const speed = foeSpeed(species, sets, {});
  const sd = showdownRange(info.baseStats.spe);
  const likely = hints ? likelyMoves(sets, [], 6) : [];
  const yours = team.flatMap((slot) => {
    const set = findSet(slot);
    if (!set) return [];
    const stat = finalStats(speciesInfo(slot.species).baseStats, set).spe;
    const mine = {
      species: slot.species,
      speed: battleSpeed(stat, { item: set.item, ability: set.ability }),
    };
    const check = { ...speed, mine };
    return [{ mine, verdict: speedVerdict(check)!, scarf: scarfFlips(check) }];
  });
  yours.sort((a, b) => b.mine.speed - a.mine.speed);

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
          <span className="text-[11.5px] text-muted"> before boosts, items, abilities</span>
        </p>
        {hints && sets.length > 0 && (
          <p className="tabular-nums">
            <span className="text-muted">Its sets here </span>
            <span className="font-semibold">
              {speed.lo === speed.hi ? speed.lo : `${speed.lo}–${speed.hi}`}
            </span>
            {speed.scarf && <span className="text-muted"> · Scarf {speed.scarf}</span>}
          </p>
        )}
        <ul className="mt-0.5 tabular-nums" aria-label="Speed against your team">
          {VERDICTS.map(([v, mark, words, tone]) => {
            const them = yours.filter((y) => y.verdict === v);
            if (!them.length) return null;
            return (
              <li key={v}>
                <span aria-hidden className={clsx('mr-1', tone)}>
                  {mark}
                </span>
                {words}{' '}
                {them.map(({ mine, scarf }, i) => (
                  <span key={mine.species} className="whitespace-nowrap">
                    {i > 0 && ', '}
                    {mine.species} <span className="text-muted">{mine.speed}</span>
                    {scarf && v !== 'either' && (
                      <span className="text-muted"> (a Scarf outspeeds)</span>
                    )}
                  </span>
                ))}
              </li>
            );
          })}
        </ul>
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
