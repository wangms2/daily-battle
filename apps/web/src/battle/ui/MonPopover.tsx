// A small Showdown-style details card for a Pokémon: the essentials only.
// Foes show just what the battle has revealed; yours show the set you brought.
import clsx from 'clsx';
import type { ReactNode } from 'react';
import { abilityInfo, itemInfo, possibleSets, shortLabel, speciesInfo } from '../../lib/data';
import { TypeBadge } from '../../ui/bits';
import { Term } from '../../ui/DetailCard';
import { MoveChips } from '../../ui/MoveList';
import type { MonView, Revealed, TeamMember } from '../frames';
import { boostLabels, STATUS_LABEL } from './labels';

/** Speed range at level 100 with 31 IVs: no EVs and a hindering nature up to 252 EVs and a boosting one. */
function speedRange(base: number): [number, number] {
  return [Math.floor((2 * base + 31 + 5) * 0.9), Math.floor((2 * base + 31 + 63 + 5) * 1.1)];
}

type Props = {
  className?: string;
  /** Actions under the details (e.g. a Switch button); makes the card tappable. */
  children?: ReactNode;
} & (
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

  // Foes: what the battle has revealed. Yours: your set, except the moves of the
  // one that's out, which the move buttons already show.
  const item = props.foe ? props.revealed?.item : props.member.item;
  const ability = props.foe ? props.revealed?.ability : props.member.ability;
  const moves = props.foe
    ? (props.revealed?.moves ?? [])
    : props.member.active
      ? []
      : props.member.moves;
  const [lo, hi] = speedRange(info.baseStats.spe);
  const speed = props.foe && props.hints ? `Speed ${lo}–${hi}` : '';
  // Beginner hints: the sets this foe could still be running, given what it has shown.
  const could =
    props.foe && props.hints
      ? possibleSets(species, props.revealed).map((s) => shortLabel(s.label))
      : [];
  // Item and ability details open on tap only when the card itself takes taps.
  const term = (name: string, kind: 'Item' | 'Ability') =>
    props.children ? (
      <Term name={name} desc={kind === 'Item' ? itemInfo(name) : abilityInfo(name)} kind={kind} />
    ) : (
      name
    );

  return (
    <div
      role={props.children ? 'dialog' : 'tooltip'}
      aria-label={props.children ? species : undefined}
      className={clsx(
        'card animate-fade-in z-30',
        !props.children && 'pointer-events-none',
        'w-[min(15rem,calc(100vw-2rem))] p-2.5 text-left',
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
      {(item || ability) && (
        <p className="mt-0.5 text-[12.5px] text-muted">
          {item && term(item, 'Item')}
          {item && ability && ' · '}
          {ability && term(ability, 'Ability')}
        </p>
      )}
      {moves.length > 0 && <MoveChips moves={moves} className="mt-1.5" />}
      {speed && <p className="mt-1 text-[12.5px] text-muted">{speed}</p>}
      {could.length > 0 && (
        <p className="mt-0.5 text-[12.5px] text-muted">
          {could.length === 1 ? 'Set: ' : 'Possible sets: '}
          {could.join(' · ')}
        </p>
      )}
      {props.children}
    </div>
  );
}
