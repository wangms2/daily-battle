// A small Showdown-style details card for a Pokémon: the essentials only.
// Foes show just what the battle has revealed; yours show the set you brought.
import clsx from 'clsx';
import { Fragment, type ReactNode } from 'react';
import {
  abilityInfo,
  canMega,
  itemInfo,
  possibleSets,
  shortLabel,
  speciesInfo,
} from '../../lib/data';
import { TypeBadge } from '../../ui/bits';
import { Term } from '../../ui/DetailCard';
import { ItemIcon } from '../../ui/ItemIcon';
import { MoveChips } from '../../ui/MoveList';
import type { MonView, Revealed, TeamMember } from '../frames';
import { scarfFlips, speedVerdict, type SpeedCheck } from '../../lib/speed';
import { boostLabels, STATUS_LABEL } from './labels';

const VERDICT = {
  faster: ['▲', 'Faster than'],
  slower: ['▼', 'Slower than'],
  tie: ['=', 'Ties with'],
  either: ['◆', 'Could be faster or slower than'],
} as const;

type Props = {
  className?: string;
  /** Actions under the details (e.g. a Switch button); makes the card tappable. */
  children?: ReactNode;
} & (
  | {
      foe: true;
      mon: MonView;
      revealed?: Revealed;
      hints: boolean;
      /** Its Speed now against your active Pokémon's (shown when given). */
      speed?: SpeedCheck;
      /** A lesson foe: its set is known, so there are no other sets it could be. */
      known?: boolean;
      /**
       * Parts of the card a lesson points at (`foe-ability`, `foe-stats`,
       * `foe-speed`): the card sits above the spotlight, so it rings them itself.
       */
      pointAt?: readonly string[];
    }
  | { foe: false; member: TeamMember; mon?: MonView | null }
);

export function MonPopover(props: Props) {
  // As it looks now (a Mega forme once Mega Evolved), and its team species.
  const species = props.foe ? props.mon.species : (props.member.forme ?? props.member.species);
  const base = props.foe ? (props.mon.base ?? species) : props.member.species;
  const info = speciesInfo(species);
  const status = props.foe ? props.mon.status : props.member.status;
  const boosts = props.foe ? props.mon.boosts : (props.mon?.boosts ?? {});
  const hp = props.foe
    ? `${props.mon.hp}%`
    : props.member.fainted
      ? 'Fainted'
      : `${props.member.hpExact.hp}/${props.member.hpExact.max}`;
  // A foe's HP is on its plate already: its card keeps to what the plate doesn't show.
  const first = [
    props.foe ? '' : hp,
    status && STATUS_LABEL[status],
    ...boostLabels(boosts),
  ].filter(Boolean);

  // Foes: what the battle has revealed. Yours: your set, except the moves of the
  // one that's out, which the move buttons already show.
  const item = props.foe ? props.revealed?.item : props.member.item;
  const ability = props.foe ? props.revealed?.ability : props.member.ability;
  const moves = props.foe
    ? (props.revealed?.moves ?? [])
    : props.member.active
      ? []
      : props.member.moves;
  const speed = props.foe ? props.speed : undefined;
  const ring = (spot: string) =>
    props.foe &&
    props.pointAt?.includes(spot) &&
    '-mx-1 rounded-badge px-1 py-0.5 ring-2 ring-spot';
  const verdict = speed && speedVerdict(speed);
  // Beginner hints: the sets this foe could still be running, given what it has shown.
  const could =
    props.foe && props.hints && !props.known
      ? possibleSets(base, props.revealed).map((s) => shortLabel(s.label))
      : [];
  // Until the battle shows its ability, every ability the species can have in this
  // generation, as on Showdown; once one is shown (an Intimidate, a Levitate
  // immunity, …) only that one is listed, above. A Mega's ability is its own, so
  // those wait for it to show.
  const abilities = props.foe && !ability && !props.mon.base ? speciesInfo(base).abilities : [];
  // Beginner hints, as on Showdown: a foe that hasn't Mega Evolved yet but could.
  const megaHint = props.foe && props.hints && !props.mon.base && canMega(base);
  // Item and ability details open on tap only when the card itself takes taps.
  const term = (name: string, kind: 'Item' | 'Ability') =>
    props.children ? (
      <Term name={name} desc={kind === 'Item' ? itemInfo(name) : abilityInfo(name)} kind={kind} />
    ) : (
      name
    );
  const withIcon = (name: string, kind: 'Item' | 'Ability') =>
    kind === 'Item' ? (
      <>
        <ItemIcon name={name} className="size-5" />
        {term(name, kind)}
      </>
    ) : (
      term(name, kind)
    );

  return (
    <div
      role={props.children ? 'dialog' : 'tooltip'}
      aria-label={props.children ? species : undefined}
      className={clsx(
        'card animate-fade-in z-30',
        !props.children && 'pointer-events-none',
        'w-[min(17rem,calc(100vw-2rem))] p-2.5 text-left',
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
      {first.length > 0 && <p className="mt-1 text-[12.5px] tabular-nums">{first.join(' · ')}</p>}
      {(item || ability) && (
        <p
          data-spot="foe-ability"
          className={clsx('mt-0.5 text-[12.5px] text-muted', ring('foe-ability'))}
        >
          {item && withIcon(item, 'Item')}
          {item && ability && ' · '}
          {ability && term(ability, 'Ability')}
        </p>
      )}
      {abilities.length > 0 && (
        <p
          data-spot="foe-ability"
          className={clsx('mt-0.5 text-[12.5px] text-muted', ring('foe-ability'))}
        >
          {'Ability: '}
          {abilities.join(' or ')}
        </p>
      )}
      {/* Your own Pokémon: every stat, as the request has them. */}
      {!props.foe && Object.keys(props.member.stats).length > 0 && (
        <dl
          className="mt-1.5 grid grid-cols-3 gap-x-2 gap-y-0.5 text-[12px] tabular-nums"
          aria-label="Stats"
        >
          {[
            ['HP', props.member.hpExact.max],
            ['Atk', props.member.stats.atk],
            ['Def', props.member.stats.def],
            ['SpA', props.member.stats.spa],
            ['SpD', props.member.stats.spd],
            ['Spe', props.member.stats.spe],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-1">
              <dt className="text-muted">{k}</dt>
              <dd className="font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {/* A foe: its species' base stats on one line, as Showdown shows them (the big ones
          bold). Speed has its own line below, as it is in battle. */}
      {props.foe && (
        <p
          data-spot="foe-stats"
          aria-label="Base stats"
          className={clsx('mt-1 text-[12px] tabular-nums', ring('foe-stats'))}
        >
          {(
            [
              ['HP', 'hp'],
              ['Atk', 'atk'],
              ['Def', 'def'],
              ['SpA', 'spa'],
              ['SpD', 'spd'],
            ] as const
          ).map(([k, key], i) => (
            <Fragment key={k}>
              {/* Between stats, the only place the line may wrap. */}
              {i > 0 && <span className="text-muted"> / </span>}
              <span className="whitespace-nowrap">
                <span className="text-muted">{k} </span>
                <span className={info.baseStats[key] >= 100 ? 'font-semibold' : ''}>
                  {info.baseStats[key]}
                </span>
              </span>
            </Fragment>
          ))}
        </p>
      )}
      {moves.length > 0 && <MoveChips moves={moves} className="mt-1.5" />}
      {speed && (
        <div
          data-spot="foe-speed"
          className={clsx('mt-1 text-[12.5px] leading-snug tabular-nums', ring('foe-speed'))}
        >
          <p>
            <span className="text-muted">Speed </span>
            <span className="font-semibold">
              {speed.lo === speed.hi ? speed.lo : `${speed.lo}–${speed.hi}`}
            </span>
          </p>
          {verdict && speed.mine && (
            <p>
              <span aria-hidden>{VERDICT[verdict][0]} </span>
              {VERDICT[verdict][1]} {speed.mine.species} ({speed.mine.speed})
            </p>
          )}
          {scarfFlips(speed) && (
            <p className="text-muted">
              <span aria-hidden>◆ </span>With a Choice Scarf: {speed.scarf}, faster
            </p>
          )}
        </div>
      )}
      {megaHint && <p className="mt-0.5 text-[12.5px] text-muted">Can Mega Evolve</p>}
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
