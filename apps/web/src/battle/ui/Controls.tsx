// The player's choices, Showdown-style: a "What will X do?" prompt, a 2×2
// grid of type-tinted move buttons, and the bench; or a "who comes in?" grid
// on a forced switch. Long-press (or hover) a move to see what it does. On a
// touch screen a tap on a benched Pokémon opens its details with a Switch
// button; a mouse hovers for details and clicks to switch.
import clsx from 'clsx';
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { getSprite } from '../../lib/sprites';
import { Button } from '../../ui/bits';
import { TYPE_COLORS } from '../../lib/types';
import { TypeBadge } from '../../ui/bits';
import type { Controls, MoveOption, TeamMember } from '../frames';
import { HpBar } from './Field';
import { STATUS_COLOR } from './labels';
import { MonPopover } from './MonPopover';

/** Effectiveness for the move's details card, and a short tag for its button. */
function effectivenessTag(e: number | null): { label: string; short: string; tone: string } | null {
  if (e === null) return null;
  if (e === 0) return { label: 'No effect', short: 'No effect', tone: 'text-bad' };
  if (e > 1) {
    return e >= 4
      ? { label: 'Super effective ×4', short: 'Super ×4', tone: 'text-good' }
      : { label: 'Super effective ×2', short: 'Super', tone: 'text-good' };
  }
  if (e < 1) {
    return e <= 0.25
      ? { label: 'Not very effective ×¼', short: 'Weak ×¼', tone: 'text-muted' }
      : { label: 'Not very effective ×½', short: 'Weak', tone: 'text-muted' };
  }
  return { label: 'Neutral ×1', short: 'Neutral', tone: 'text-muted' };
}

/** Touch: a press this long is a hold. The details open then, and lifting won't act. */
const HOLD = 400;

/**
 * Hover (mouse) or a hold (touch) shows info; a plain tap acts. On touch the
 * two never overlap: lift before HOLD and the tap acts (no details flash by);
 * at HOLD the details open, and lifting leaves them open without acting,
 * until the next tap anywhere. Without `longPress`, touch only taps.
 */
function usePressInfo(
  show: () => void,
  hide: () => void,
  act: (pointer: string) => void,
  longPress = true,
) {
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const held = useRef(false);
  const down = useRef(false);
  const pointer = useRef('');
  const clear = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  return {
    onPointerDown: (e: ReactPointerEvent) => {
      held.current = false;
      down.current = true;
      pointer.current = e.pointerType;
      if (e.pointerType === 'mouse' || !longPress) return;
      clear();
      timers.current = [
        setTimeout(() => {
          held.current = true;
          show();
        }, HOLD),
      ];
    },
    onPointerUp: () => {
      down.current = false;
      clear();
      // Held: the info stays until the next tap anywhere (which closes it first).
      if (held.current) {
        document.addEventListener('pointerdown', hide, { capture: true, once: true });
      }
    },
    onPointerLeave: (e: ReactPointerEvent) => {
      if (e.pointerType === 'mouse') return hide();
      // A finger lifting also "leaves"; only one sliding off (a scroll) cancels.
      if (!down.current) return;
      down.current = false;
      clear();
      if (!held.current) hide();
    },
    onPointerCancel: () => {
      down.current = false;
      clear();
      if (!held.current) hide();
    },
    onPointerEnter: (e: ReactPointerEvent) => {
      if (e.pointerType === 'mouse') show();
    },
    onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
    // Keyboard users get the details on focus (their long-press).
    onFocus: (e: { currentTarget: Element }) => {
      if (e.currentTarget.matches(':focus-visible')) show();
    },
    onBlur: hide,
    onClick: () => {
      if (held.current) {
        held.current = false;
        return;
      }
      const type = pointer.current;
      pointer.current = '';
      // A mouse click keeps a hover card in place; anything else starts fresh.
      if (type !== 'mouse') hide();
      act(type);
    },
  };
}

/** Review mode (the coach's review): the choice made, the better one, and the rest. */
export type Mark = 'you' | 'better' | 'best' | 'first';

const MARK_LABEL: Record<Mark, string> = {
  you: 'You',
  better: 'Better',
  best: 'You · Best',
  first: 'Warned',
};

/** The tag on a marked choice; unmarked ones fade. */
function MarkTag({ mark }: { mark: Mark }) {
  return (
    <span
      className={clsx(
        'pointer-events-none absolute -top-2 right-1 z-10 rounded-full px-1.5 text-[11px] leading-[18px] font-bold shadow-card',
        mark === 'you' || mark === 'first' ? 'bg-ink text-surface' : 'bg-accent text-white',
      )}
    >
      {MARK_LABEL[mark]}
    </span>
  );
}

const markRing = (mark: Mark | undefined, marking: boolean) =>
  !marking
    ? undefined
    : mark === 'you' || mark === 'first'
      ? 'outline-2 outline-offset-2 outline-ink'
      : mark
        ? 'outline-[3px] outline-offset-2 outline-accent'
        : 'opacity-30 saturate-50';

function MoveButton({
  move,
  hints,
  onChoose,
  onInfo,
  mark,
  marking = false,
}: {
  move: MoveOption;
  hints: boolean;
  onChoose: () => void;
  onInfo: (move: MoveOption | null) => void;
  mark?: Mark | undefined;
  /** Review mode: marked choices stand out and the rest fade. */
  marking?: boolean;
}) {
  const color = TYPE_COLORS[move.type]?.bg ?? '#888';
  const tag = hints ? effectivenessTag(move.effectiveness) : null;
  const press = usePressInfo(
    () => onInfo(move),
    () => onInfo(null),
    () => {
      onInfo(null);
      onChoose();
    },
  );
  return (
    <div
      data-spot={move.choice}
      className={clsx('relative h-full rounded-btn', markRing(mark, marking))}
    >
      {mark && <MarkTag mark={mark} />}
      <button
        type="button"
        disabled={move.disabled}
        aria-label={`${move.name}, ${move.type}, ${move.pp} of ${move.maxpp} PP${tag ? `, ${tag.label}` : ''}${mark ? `, ${MARK_LABEL[mark]}` : ''}`}
        {...press}
        className={clsx(
          'move-btn short:min-h-[2.5rem] short:pt-1 short:pb-0.5 flex h-full min-h-[3.25rem] w-full flex-col justify-between overflow-hidden rounded-btn px-2 pt-1.5 pb-1 select-none',
          marking ? 'pointer-events-none' : 'active:translate-y-px disabled:opacity-40',
        )}
        style={{ '--type': color } as CSSProperties}
      >
        <span className="battle-pixel short:leading-[18px] truncate text-center leading-5">
          {move.name}
        </span>
        {/* Type on the left; with hints, a short effectiveness tag beside the PP. */}
        <span className="short:text-[10.5px] short:leading-3 flex items-baseline justify-between gap-1 text-[11px] leading-4">
          <span className="truncate font-medium text-muted">{move.type}</span>
          <span className="flex shrink-0 items-baseline gap-1 tabular-nums">
            {hints && (
              <span className={clsx('font-semibold', tag ? tag.tone : 'text-muted')}>
                {tag ? tag.short : 'Status'}
              </span>
            )}
            {hints && <span className="text-muted">·</span>}
            <span className="text-muted">
              {move.pp}/{move.maxpp}
            </span>
          </span>
        </span>
      </button>
    </div>
  );
}

function BenchButton({
  member,
  choice,
  onChoose,
  onInfo,
  onPin,
  shown = false,
  big = false,
  off = false,
  direct = false,
  current = false,
  mark,
  marking = false,
}: {
  mark?: Mark | undefined;
  /** Review mode: marked choices stand out and the rest fade. */
  marking?: boolean;
  member: TeamMember;
  choice?: string;
  onChoose: (c: string) => void;
  onInfo: (m: TeamMember | null) => void;
  /** Opens (or closes) its tapped details card, the one with the Switch button. */
  onPin: (m: TeamMember | null) => void;
  /** Its tapped details card is open. */
  shown?: boolean;
  big?: boolean;
  /** The whole panel is disabled (a turn is playing). */
  off?: boolean;
  /** A touch acts too, without the details card first (the only Pokémon left to send in). */
  direct?: boolean;
  /** The Pokémon in battle: first in the row, with its details on a tap, but nothing to switch to. */
  current?: boolean;
}) {
  const disabled = !choice || off || marking;
  const press = usePressInfo(
    () => onInfo(member),
    () => onInfo(null),
    // A mouse click (which already saw the details on hover) or the keyboard
    // switches; a touch opens the details first, and their button switches.
    (type) => {
      if (type === 'mouse' || type === '' || direct) {
        if (!disabled && choice) onChoose(choice);
      } else onPin(shown ? null : member);
    },
    false,
  );
  return (
    <button
      type="button"
      // Fainted or locked-in Pokémon still show their details.
      aria-disabled={disabled}
      {...press}
      data-bench
      data-spot={choice}
      aria-expanded={shown || undefined}
      aria-current={current || undefined}
      aria-label={
        (current
          ? `${member.species}, in battle, ${member.hp}% HP`
          : `Switch to ${member.species}, ${member.hp}% HP${member.fainted ? ', fainted' : ''}`) +
        (mark ? `, ${MARK_LABEL[mark]}` : '')
      }
      className={clsx(
        'card relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 select-none',
        // Short phones: the switch cards get shorter (names stay whole) and the bench
        // row's tiles shrink, to leave the battle text room.
        big ? 'short:py-1 py-2' : 'short:py-0.5 short:gap-0 py-1',
        marking
          ? markRing(mark, marking)
          : [
              current && 'outline-accent outline-2 -outline-offset-2',
              disabled && !current && 'opacity-40',
            ],
      )}
    >
      {mark && <MarkTag mark={mark} />}
      <img
        src={getSprite(member.species, big ? 'front' : 'icon')}
        alt=""
        draggable={false}
        className={clsx(
          'pixelated object-contain',
          big ? 'short:h-8 short:w-10 h-12 w-14' : 'short:h-6 short:w-8 h-7 w-9',
        )}
      />
      <span className="flex w-full min-w-0 flex-col gap-0.5">
        {/* Names always on the forced-switch cards; on the bench row only where there's room. */}
        <span
          className={clsx(
            'short:text-[11.5px] w-full truncate text-center text-[12px] font-semibold',
            !big && 'hidden wide:block',
          )}
        >
          {member.species}
        </span>
        <span className="flex w-full items-center gap-1 px-0.5">
          <HpBar hp={member.hp} animate={false} className="h-1.5 flex-1" />
          {member.status && (
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ background: STATUS_COLOR[member.status] }}
            />
          )}
        </span>
      </span>
    </button>
  );
}

/** A move's details card: what matters for choosing it, Showdown-style. */
function MoveDetails({ move, hints }: { move: MoveOption; hints: boolean }) {
  const tag = hints ? effectivenessTag(move.effectiveness) : null;
  const facts: [string, string][] = [
    ['Power', move.power ? String(move.power) : '—'],
    ['Accuracy', move.accuracy === true ? 'Never misses' : `${move.accuracy}%`],
    ['PP', `${move.pp}/${move.maxpp}`],
  ];
  const notes = [
    move.priority > 0 && `Priority +${move.priority}: usually moves first`,
    move.priority < 0 && `Priority ${move.priority}: usually moves last`,
    move.contact && 'Makes contact',
  ].filter(Boolean);
  return (
    <>
      <div className="flex items-center gap-2">
        <span className="text-[15px] font-semibold">{move.name}</span>
        <TypeBadge type={move.type} />
        <span className="text-[12px] text-muted">{move.category}</span>
        {tag && (
          <span className={clsx('ml-auto text-[12px] font-semibold', tag.tone)}>{tag.label}</span>
        )}
      </div>
      <dl className="mt-1.5 flex gap-4 text-[12px] tabular-nums">
        {facts.map(([k, v]) => (
          <div key={k} className="flex gap-1">
            <dt className="text-muted">{k}</dt>
            <dd className="font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      {move.desc && <p className="mt-1.5 text-[13px] leading-snug">{move.desc}</p>}
      {notes.length > 0 && (
        <p className="mt-1 text-[12px] font-medium text-muted">{notes.join(' · ')}</p>
      )}
    </>
  );
}

type Info = { move: MoveOption } | { member: TeamMember } | null;

// Whether the player is driving with the keyboard, so focus can follow the
// choices from turn to turn without moving it for pointer users.
let usingKeyboard = false;
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', () => (usingKeyboard = true), true);
  window.addEventListener('pointerdown', () => (usingKeyboard = false), true);
}

export function ControlPanel({
  controls,
  team,
  hints,
  disabled,
  onChoose,
  marks,
  show,
}: {
  controls: Controls | null;
  team: TeamMember[];
  hints: boolean;
  /** Dimmed while a turn plays out. */
  disabled: boolean;
  onChoose: (choice: string) => void;
  /**
   * Review mode (the coach's review): nothing can be chosen; these choices are
   * tagged and the rest fade.
   */
  marks?: Record<string, Mark>;
  /**
   * A choice whose details are open from the start (a lesson pointing at them):
   * a move's details, or a teammate's card.
   */
  show?: string;
}) {
  const marking = !!marks && !disabled;
  // Hover and focus cards belong to the turn they opened in too: a button that
  // goes away (a forced switch made) never sees the pointer leave.
  const [hover, setHover] = useState<{ info: Info; at: Controls | null } | null>(null);
  // The Mega toggle belongs to the turn it was set in.
  const [megaOn, setMegaOn] = useState<{ at: Controls | null } | null>(null);
  const shownMove =
    show && controls?.kind === 'move' ? controls.moves.find((m) => m.choice === show) : undefined;
  const info = hover && hover.at === controls ? hover.info : shownMove ? { move: shownMove } : null;
  const setInfo = (i: Info) => setHover(i && { info: i, at: controls });
  const off = disabled || !controls;
  // The bench card opened by a tap (touch), which carries the Switch button.
  // It belongs to the turn it was opened in, so it closes when the turn moves on.
  const [pin, setPin] = useState<{ member: TeamMember; at: [Controls | null, boolean] } | null>(
    null,
  );
  const shownMember = show?.startsWith('switch ')
    ? team.find((m) => controls?.switches.find((s) => s.slot === m.slot)?.choice === show)
    : undefined;
  const pinned =
    pin && pin.at[0] === controls && pin.at[1] === off ? pin.member : (shownMember ?? null);
  const setPinned = (m: TeamMember | null) => setPin(m && { member: m, at: [controls, off] });
  const active = team.find((m) => m.active);
  const bench = team.filter((m) => !m.active);
  const switchFor = (m: TeamMember) => controls?.switches.find((s) => s.slot === m.slot)?.choice;
  const memberInfo = (m: TeamMember | null) => setInfo(m && { member: m });
  const pinnedSlot = pinned?.slot ?? null;
  // A tapped bench card closes on a tap anywhere else.
  useEffect(() => {
    if (pinnedSlot === null) return;
    const close = (e: PointerEvent) => {
      if (!(e.target as Element | null)?.closest?.('[data-bench],[data-bench-card]')) {
        setPin(null);
      }
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [pinnedSlot]);
  const panel = useRef<HTMLDivElement>(null);
  // When choices come back after a turn and focus was lost, put it on the first one.
  useEffect(() => {
    if (off || !usingKeyboard) return;
    const lost = !document.activeElement || document.activeElement === document.body;
    if (!lost) return;
    panel.current
      ?.querySelector<HTMLElement>('button:enabled:not([aria-disabled="true"])')
      ?.focus();
  }, [off, controls]);

  const pinnedChoice = pinned && !off ? switchFor(pinned) : undefined;
  const tooltip = pinned ? (
    <div data-bench-card data-spot="team-card" className="absolute bottom-full left-0 z-30 mb-2">
      <MonPopover foe={false} member={pinned}>
        {pinnedChoice && (
          <Button
            className="mt-2 h-10 w-full"
            onClick={() => {
              setPinned(null);
              onChoose(pinnedChoice);
            }}
          >
            {controls?.kind === 'switch' ? 'Send in' : 'Switch to'} {pinned.species}
          </Button>
        )}
      </MonPopover>
    </div>
  ) : (
    info &&
    ('move' in info ? (
      <div
        // Above a lesson's spotlight, like the other details cards.
        className="card animate-fade-in pointer-events-none absolute inset-x-0 bottom-full z-30 mb-2 p-3"
        role="tooltip"
        data-spot="move-details"
      >
        <MoveDetails move={info.move} hints={hints} />
      </div>
    ) : (
      <MonPopover foe={false} member={info.member} className="absolute bottom-full left-0 mb-2" />
    ))
  );

  if (controls?.kind === 'switch') {
    const last = controls.switches.length === 1;
    return (
      <div ref={panel} className="short:gap-1 relative flex shrink-0 flex-col gap-2">
        {tooltip}
        <p className="display text-[14px]">
          {last ? 'Send in your last Pokémon' : 'Who comes in?'}
        </p>
        <div className={clsx('short:gap-1.5 grid grid-cols-3 gap-2', disabled && 'opacity-50')}>
          {bench.map((m) => (
            <BenchButton
              key={m.species}
              member={m}
              choice={switchFor(m)}
              onChoose={onChoose}
              onInfo={memberInfo}
              onPin={setPinned}
              shown={pinnedSlot === m.slot}
              off={disabled}
              direct={last}
              big
              mark={marks?.[switchFor(m) ?? '']}
              marking={marking}
            />
          ))}
        </div>
      </div>
    );
  }

  const moves = controls?.moves ?? [];
  // Mega Evolution (Gen 6): a toggle above the moves, as on Showdown. Once
  // your team's Mega is used it stays, disabled, to say so.
  const megaUsed = team.some((m) => m.forme);
  const canMega = !!controls?.canMega;
  const mega = !!megaOn && canMega && megaOn.at === controls;
  const withMega = (choice: string) => (mega ? `${choice} mega` : choice);
  return (
    <div ref={panel} className="short:gap-1 relative flex shrink-0 flex-col gap-1.5">
      {tooltip}
      <p
        className={clsx(
          'flex h-5 items-center justify-between gap-2 text-[13.5px]',
          off && 'opacity-50',
        )}
      >
        <span className="truncate">
          {!off && active && !active.fainted ? (
            <>
              What will <strong>{active.species}</strong> do?
            </>
          ) : (
            ' '
          )}
        </span>
        {!off && active && !active.fainted && (
          <span className="shrink-0 rounded-badge border border-line px-1.5 text-[11.5px] leading-[18px] text-muted tabular-nums">
            HP {active.hpExact.hp}/{active.hpExact.max}
          </span>
        )}
      </p>
      {(canMega || megaUsed) && (
        <button
          type="button"
          aria-pressed={mega}
          disabled={off || !canMega}
          onClick={() => setMegaOn(mega ? null : { at: controls })}
          className={clsx(
            'flex h-8 items-center justify-center gap-2 rounded-btn border text-[13.5px] font-semibold select-none disabled:opacity-40',
            mega ? 'border-accent bg-accent-soft text-soft-ink' : 'border-line text-muted',
          )}
        >
          <span
            aria-hidden
            className={clsx(
              'grid size-4 place-items-center rounded-full border-2',
              mega ? 'border-accent bg-accent' : 'border-current',
            )}
          />
          {canMega ? 'Mega Evolve' : 'Mega Evolution used'}
        </button>
      )}
      <div
        data-spot="your-moves"
        className={clsx(
          'short:gap-1.5 grid grid-cols-2 grid-rows-2 gap-2',
          off && 'pointer-events-none opacity-50',
        )}
      >
        {(moves.length ? moves : Array.from({ length: 4 }, () => null)).map((m, i) =>
          m ? (
            <MoveButton
              key={m.choice}
              move={disabled ? { ...m, disabled: true } : m}
              hints={hints}
              onChoose={() => onChoose(withMega(m.choice))}
              onInfo={(move) => setInfo(move && { move })}
              mark={marks?.[m.choice]}
              marking={marking}
            />
          ) : (
            <div
              key={i}
              className="min-h-[3.25rem] rounded-btn border border-dashed border-line"
              aria-hidden
            />
          ),
        )}
      </div>
      <div
        data-spot="your-team"
        className="short:gap-1 flex gap-1.5"
        role="group"
        aria-label="Switch"
      >
        {/* As on Showdown: your Pokémon in battle first, then the rest of the team. */}
        {(active ? [active, ...bench] : bench).map((m) => (
          <BenchButton
            key={m.species}
            member={m}
            choice={switchFor(m)}
            onChoose={onChoose}
            onInfo={memberInfo}
            onPin={setPinned}
            shown={pinnedSlot === m.slot}
            off={off}
            current={m === active}
            mark={marks?.[switchFor(m) ?? '']}
            marking={marking}
          />
        ))}
      </div>
    </div>
  );
}
