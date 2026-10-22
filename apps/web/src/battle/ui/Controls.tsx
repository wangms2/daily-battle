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

function effectivenessTag(e: number | null): { label: string; tone: string } | null {
  if (e === null) return null;
  if (e === 0) return { label: 'No effect', tone: 'text-bad' };
  if (e > 1) return { label: e >= 4 ? 'Super effective ×4' : 'Super effective', tone: 'text-good' };
  if (e < 1) return { label: 'Not very effective', tone: 'text-muted' };
  return { label: 'Effective', tone: 'text-muted' };
}

/**
 * Long-press (touch) or hover (mouse) shows info; a plain tap acts. A tap that
 * ends a long-press only closes the info. Without `longPress`, touch only taps.
 */
function usePressInfo(
  show: () => void,
  hide: () => void,
  act: (pointer: string) => void,
  longPress = true,
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const pointer = useRef('');
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  return {
    onPointerDown: (e: ReactPointerEvent) => {
      longPressed.current = false;
      pointer.current = e.pointerType;
      if (e.pointerType === 'mouse' || !longPress) return;
      timer.current = setTimeout(() => {
        longPressed.current = true;
        show();
      }, 420);
    },
    onPointerUp: clear,
    onPointerLeave: (e: ReactPointerEvent) => {
      clear();
      if (e.pointerType === 'mouse' || longPressed.current) hide();
    },
    onPointerCancel: clear,
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
      if (longPressed.current) {
        longPressed.current = false;
        hide();
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

function MoveButton({
  move,
  hints,
  onChoose,
  onInfo,
}: {
  move: MoveOption;
  hints: boolean;
  onChoose: () => void;
  onInfo: (move: MoveOption | null) => void;
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
    <button
      type="button"
      disabled={move.disabled}
      aria-label={`${move.name}, ${move.type}, ${move.pp} of ${move.maxpp} PP${tag ? `, ${tag.label}` : ''}`}
      {...press}
      className="move-btn flex h-full min-h-[3.25rem] flex-col justify-between overflow-hidden rounded-btn px-2 pt-1.5 pb-1 select-none active:translate-y-px disabled:opacity-40"
      style={{ '--type': color } as CSSProperties}
    >
      <span className="truncate text-center text-[14.5px] leading-5 font-semibold">
        {move.name}
      </span>
      <span className="flex items-baseline justify-between gap-1 text-[11px] leading-4">
        <span className={clsx('truncate font-medium', tag ? tag.tone : 'text-muted')}>
          {tag ? tag.label : move.type}
        </span>
        <span className="shrink-0 text-muted tabular-nums">
          {move.pp}/{move.maxpp}
        </span>
      </span>
    </button>
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
}: {
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
}) {
  const disabled = !choice || off;
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
      aria-expanded={shown || undefined}
      aria-label={`Switch to ${member.species}, ${member.hp}% HP${member.fainted ? ', fainted' : ''}`}
      className={clsx(
        'card flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 select-none',
        big ? 'py-2' : 'py-1',
        disabled && 'opacity-40',
      )}
    >
      <img
        src={getSprite(member.species, big ? 'front' : 'icon')}
        alt=""
        draggable={false}
        className={clsx('pixelated object-contain', big ? 'h-12 w-14' : 'h-7 w-9')}
      />
      {/* Names always on the forced-switch cards; on the bench row only where there's room. */}
      <span
        className={clsx(
          'w-full truncate text-center text-[12px] font-semibold',
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
    </button>
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
}: {
  controls: Controls | null;
  team: TeamMember[];
  hints: boolean;
  /** Dimmed while a turn plays out. */
  disabled: boolean;
  onChoose: (choice: string) => void;
}) {
  // Hover and focus cards belong to the turn they opened in too: a button that
  // goes away (a forced switch made) never sees the pointer leave.
  const [hover, setHover] = useState<{ info: Info; at: Controls | null } | null>(null);
  const info = hover && hover.at === controls ? hover.info : null;
  const setInfo = (i: Info) => setHover(i && { info: i, at: controls });
  const off = disabled || !controls;
  // The bench card opened by a tap (touch), which carries the Switch button.
  // It belongs to the turn it was opened in, so it closes when the turn moves on.
  const [pin, setPin] = useState<{ member: TeamMember; at: [Controls | null, boolean] } | null>(
    null,
  );
  const pinned = pin && pin.at[0] === controls && pin.at[1] === off ? pin.member : null;
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
    <div data-bench-card className="absolute bottom-full left-0 z-30 mb-2">
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
        className="card animate-fade-in pointer-events-none absolute inset-x-0 bottom-full z-10 mb-2 p-3"
        role="tooltip"
      >
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-semibold">{info.move.name}</span>
          <TypeBadge type={info.move.type} />
          <span className="text-[12px] text-muted">{info.move.category}</span>
        </div>
        <p className="mt-1 text-[12px] text-muted tabular-nums">
          {info.move.power ? `Power ${info.move.power}` : 'No damage'} · Accuracy{' '}
          {info.move.accuracy === true ? '—' : `${info.move.accuracy}%`} · PP {info.move.pp}/
          {info.move.maxpp}
        </p>
        {info.move.desc && <p className="mt-1 text-[13px]">{info.move.desc}</p>}
      </div>
    ) : (
      <MonPopover foe={false} member={info.member} className="absolute bottom-full left-0 mb-2" />
    ))
  );

  if (controls?.kind === 'switch') {
    const last = controls.switches.length === 1;
    return (
      <div ref={panel} className="relative flex shrink-0 flex-col gap-2">
        {tooltip}
        <p className="display text-[14px]">
          {last ? 'Send in your last Pokémon' : 'Who comes in?'}
        </p>
        <div className={clsx('grid grid-cols-3 gap-2', disabled && 'opacity-50')}>
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
            />
          ))}
        </div>
      </div>
    );
  }

  const moves = controls?.moves ?? [];
  return (
    <div ref={panel} className="relative flex shrink-0 flex-col gap-1.5">
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
      <div
        className={clsx(
          'grid grid-cols-2 grid-rows-2 gap-2',
          off && 'pointer-events-none opacity-50',
        )}
      >
        {(moves.length ? moves : Array.from({ length: 4 }, () => null)).map((m, i) =>
          m ? (
            <MoveButton
              key={m.choice}
              move={disabled ? { ...m, disabled: true } : m}
              hints={hints}
              onChoose={() => onChoose(m.choice)}
              onInfo={(move) => setInfo(move && { move })}
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
      <div className="flex gap-1.5" role="group" aria-label="Switch">
        {bench.map((m) => (
          <BenchButton
            key={m.species}
            member={m}
            choice={switchFor(m)}
            onChoose={onChoose}
            onInfo={memberInfo}
            onPin={setPinned}
            shown={pinnedSlot === m.slot}
            off={off}
          />
        ))}
      </div>
    </div>
  );
}
