// A small Showdown-style details card for a Pokémon: the essentials only.
// Foes show just what the battle has revealed; yours show the set you brought.
import clsx from 'clsx';
import { speciesInfo } from '../../lib/data';
import { TypeBadge } from '../../ui/bits';
import type { MonView, Revealed, TeamMember } from '../frames';
import { boostLabels, STATUS_LABEL } from './labels';

/** Speed range at level 100 with 31 IVs: no EVs and a hindering nature up to 252 EVs and a boosting one. */
function speedRange(base: number): [number, number] {
  return [Math.floor((2 * base + 31 + 5) * 0.9), Math.floor((2 * base + 31 + 63 + 5) * 1.1)];
}

type Props = { className?: string } & (
  | { foe: true; mon: MonView; revealed?: Revealed; hints: boolean }
  | { foe: false; member: TeamMember; mon?: MonView | null }
);

export function MonPopover(props: Props) {
  const species = props.foe ? props.mon.species : props.member.species;
  const info = speciesInfo(species);
  const status = props.foe ? props.mon.status : props.member.status;
  const boosts = props.foe ? props.mon.boosts : (props.mon?.boosts ?? {});
  const hp = props.foe
    ? `${props.mon.hp}%`
    : props.member.fainted
      ? 'Fainted'
      : `${props.member.hpExact.hp}/${props.member.hpExact.max}`;
  const first = [hp, status && STATUS_LABEL[status], ...boostLabels(boosts)].filter(Boolean);

  let lines: string[];
  if (props.foe) {
    const r = props.revealed;
    const [lo, hi] = speedRange(info.baseStats.spe);
    lines = [
      [r?.item, r?.ability].filter(Boolean).join(' · '),
      r?.moves.join(', ') ?? '',
      props.hints ? `Speed ${lo}–${hi}` : '',
    ];
  } else {
    lines = [
      [props.member.item, props.member.ability].filter(Boolean).join(' · '),
      props.member.moves.join(' · '),
    ];
  }

  return (
    <div
      role="tooltip"
      className={clsx(
        'card animate-fade-in pointer-events-none z-30 w-[min(15rem,calc(100vw-2rem))] p-2.5 text-left',
        props.className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[14px] font-semibold">{species}</span>
        <span className="flex shrink-0 gap-1">
          {info.types.map((t) => (
            <TypeBadge key={t} type={t} />
          ))}
        </span>
      </div>
      <p className="mt-1 text-[12.5px] tabular-nums">{first.join(' · ')}</p>
      {lines.filter(Boolean).map((l, i) => (
        <p key={i} className="mt-0.5 text-[12.5px] text-muted">
          {l}
        </p>
      ))}
    </div>
  );
}
