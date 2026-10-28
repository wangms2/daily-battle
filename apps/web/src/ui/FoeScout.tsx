// What you can learn about an opponent before the battle: the same facts its
// card shows in battle (types, abilities, base stats, Showdown's Speed range,
// and with Beginner hints its likely moves), never one of its sets. Its Speed is
// weighed against each of your six, as the battle card weighs it against the
// one that's out.
import clsx from 'clsx';
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

const VERDICT = {
  faster: ['▲', 'Faster than', 'text-bad'],
  slower: ['▼', 'Slower than', 'text-good'],
  tie: ['=', 'Ties with', 'text-muted'],
  either: ['◆', 'Possibly faster than', 'text-muted'],
} as const;

function Heading({ children }: { children: string }) {
  return <h3 className="mt-4 mb-1.5 text-[13px] font-semibold text-muted">{children}</h3>;
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
    <div className="text-[13px]">
      <div className="flex items-center gap-3">
        <img
          src={getSprite(species)}
          alt=""
          className="pixelated size-16 shrink-0 object-contain"
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
          </p>
          {hints && canMega(species) && <p className="font-semibold">Can Mega Evolve</p>}
        </div>
      </div>

      <Heading>Base stats</Heading>
      <dl
        className="flex justify-between gap-1 rounded-chip bg-surface-2 px-2.5 py-1.5 tabular-nums"
        aria-label="Base stats"
      >
        {STAT_IDS.map((k) => (
          <div key={k} className="flex flex-col items-center">
            <dt className="text-[11px] text-muted">{STAT_LABEL[k]}</dt>
            <dd className={clsx('text-[14px]', info.baseStats[k] >= 100 && 'font-bold')}>
              {info.baseStats[k]}
            </dd>
          </div>
        ))}
      </dl>

      <Heading>Speed</Heading>
      <p className="tabular-nums" aria-label="Speed range">
        <span className="font-semibold">{sd[0]}</span>
        <span className="text-muted">
          –{sd[1]}–{sd[2]}–
        </span>
        <span className="font-semibold">{sd[3]}</span>
        <span className="text-[11.5px] text-muted"> before boosts, items and abilities</span>
      </p>
      {hints && sets.length > 0 && (
        <p className="tabular-nums">
          <span className="text-muted">Its sets here </span>
          <span className="font-semibold">
            {speed.lo === speed.hi ? speed.lo : `${speed.lo}–${speed.hi}`}
          </span>
          {speed.scarf && <span className="text-muted"> · {speed.scarf} with a Choice Scarf</span>}
        </p>
      )}
      <ul className="mt-1.5 space-y-0.5 tabular-nums" aria-label="Speed against your team">
        {yours.map(({ mine, verdict, scarf }) => (
          <li key={mine.species} className="flex items-baseline gap-1.5">
            <span aria-hidden className={clsx('w-3 shrink-0 text-center', VERDICT[verdict][2])}>
              {VERDICT[verdict][0]}
            </span>
            <span className="min-w-0">
              {VERDICT[verdict][1]} {mine.species} ({mine.speed})
              {scarf && <span className="text-muted"> · faster with a Scarf</span>}
            </span>
          </li>
        ))}
      </ul>

      {likely.length > 0 && (
        <>
          <Heading>Likely moves</Heading>
          <MoveChips moves={likely} />
        </>
      )}

      <Heading>Matchups</Heading>
      <div className="grid gap-2">
        <MatchupRow
          label="Weak to"
          types={m.weak.map((w) => w.type)}
          extra={(t) => (m.weak.find((w) => w.type === t)!.mult === 4 ? '×4' : '')}
        />
        <MatchupRow label="Resists" types={m.resist.map((r) => r.type)} />
        {m.immune.length > 0 && <MatchupRow label="Immune" types={m.immune} />}
      </div>
    </div>
  );
}
