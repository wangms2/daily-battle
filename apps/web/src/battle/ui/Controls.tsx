// The player's choices: a 2×2 move grid plus the bench, or a "who comes in?"
// grid on a forced switch. Long-press (or hover) a move to see what it does.
import clsx from 'clsx';
import { useRef, useState } from 'react';
import { getSprite } from '../../lib/sprites';
import { TYPE_COLORS } from '../../lib/types';
import { TypeBadge } from '../../ui/bits';
import type { Controls, MoveOption, TeamMember } from '../frames';
import { HpBar } from './Field';
import { STATUS_COLOR } from './labels';

function effectivenessTag(e: number | null): { label: string; tone: string } | null {
  if (e === null) return null;
  if (e === 0) return { label: 'No effect', tone: 'text-bad' };
  if (e > 1) return { label: e >= 4 ? 'Super effective ×4' : 'Super effective', tone: 'text-good' };
  if (e < 1) return { label: 'Not very effective', tone: 'text-muted' };
  return { label: 'Effective', tone: 'text-muted' };
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
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const color = TYPE_COLORS[move.type]?.bg ?? '#888';
  const tag = hints ? effectivenessTag(move.effectiveness) : null;
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  return (
    <button
      type="button"
      disabled={move.disabled}
      aria-label={`${move.name}, ${move.type}, ${move.pp} of ${move.maxpp} PP${tag ? `, ${tag.label}` : ''}`}
      onPointerDown={(e) => {
        longPressed.current = false;
        if (e.pointerType === 'mouse') return;
        timer.current = setTimeout(() => {
          longPressed.current = true;
          onInfo(move);
        }, 420);
      }}
      onPointerUp={clear}
      onPointerLeave={() => {
        clear();
        if (longPressed.current) onInfo(null);
      }}
      onPointerCancel={clear}
      onMouseEnter={() => onInfo(move)}
      onMouseLeave={() => onInfo(null)}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        if (longPressed.current) {
          longPressed.current = false;
          onInfo(null);
          return;
        }
        onInfo(null);
        onChoose();
      }}
      className="relative flex h-full min-h-12 flex-col justify-center overflow-hidden rounded-btn border border-line bg-surface pr-2 pl-3 text-left shadow-card select-none active:translate-y-px disabled:opacity-40"
      style={{ background: `color-mix(in srgb, ${color} 9%, var(--surface))` }}
    >
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: color }} aria-hidden />
      <span className="flex items-baseline justify-between gap-1">
        <span className="truncate text-[14px] font-semibold">{move.name}</span>
        <span className="shrink-0 text-[11px] text-muted tabular-nums">
          {move.pp}/{move.maxpp}
        </span>
      </span>
      <span className={clsx('truncate text-[11.5px] font-medium', tag ? tag.tone : 'text-muted')}>
        {tag ? tag.label : move.type}
      </span>
    </button>
  );
}

function BenchButton({
  member,
  choice,
  onChoose,
  big = false,
  off = false,
}: {
  member: TeamMember;
  choice?: string;
  onChoose: (c: string) => void;
  big?: boolean;
  /** The whole panel is disabled (a turn is playing). */
  off?: boolean;
}) {
  const disabled = !choice || off;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => choice && onChoose(choice)}
      aria-label={`Switch to ${member.species}, ${member.hp}% HP${member.fainted ? ', fainted' : ''}`}
      className={clsx(
        'card flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 disabled:opacity-40',
        big ? 'py-2' : 'py-1',
      )}
    >
      <img
        src={getSprite(member.species, big ? 'front' : 'icon')}
        alt=""
        className={clsx('pixelated object-contain', big ? 'h-12 w-14' : 'h-7 w-9')}
      />
      {big && (
        <span className="w-full truncate text-center text-[12px] font-semibold">
          {member.species}
        </span>
      )}
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
  const [info, setInfo] = useState<MoveOption | null>(null);
  const bench = team.filter((m) => !m.active);
  const switchFor = (m: TeamMember) => controls?.switches.find((s) => s.slot === m.slot)?.choice;

  if (controls?.kind === 'switch') {
    return (
      <div
        className={clsx(
          'flex shrink-0 flex-col gap-2',
          disabled && 'pointer-events-none opacity-50',
        )}
      >
        <p className="display text-[14px]">Who comes in?</p>
        <div className="grid grid-cols-3 gap-2">
          {bench.map((m) => (
            <BenchButton
              key={m.species}
              member={m}
              choice={switchFor(m)}
              onChoose={onChoose}
              off={disabled}
              big
            />
          ))}
        </div>
      </div>
    );
  }

  const moves = controls?.moves ?? [];
  return (
    <div
      className={clsx(
        'relative flex shrink-0 flex-col gap-2',
        (disabled || !controls) && 'pointer-events-none opacity-50',
      )}
    >
      {info && (
        <div
          className="card animate-fade-in pointer-events-none absolute inset-x-0 bottom-full z-10 mb-2 p-3"
          role="tooltip"
        >
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-semibold">{info.name}</span>
            <TypeBadge type={info.type} />
            <span className="text-[12px] text-muted">{info.category}</span>
          </div>
          <p className="mt-1 text-[12px] text-muted tabular-nums">
            {info.power ? `Power ${info.power}` : 'No damage'} · Accuracy{' '}
            {info.accuracy === true ? '—' : `${info.accuracy}%`} · PP {info.pp}/{info.maxpp}
          </p>
          {info.desc && <p className="mt-1 text-[13px]">{info.desc}</p>}
        </div>
      )}
      <div className="grid grid-cols-2 grid-rows-2 gap-2">
        {(moves.length ? moves : Array.from({ length: 4 }, () => null)).map((m, i) =>
          m ? (
            <MoveButton
              key={m.choice}
              move={disabled ? { ...m, disabled: true } : m}
              hints={hints}
              onChoose={() => onChoose(m.choice)}
              onInfo={setInfo}
            />
          ) : (
            <div
              key={i}
              className="min-h-12 rounded-btn border border-dashed border-line"
              aria-hidden
            />
          ),
        )}
      </div>
      <div className="flex gap-1.5" aria-label="Switch">
        {bench.map((m) => (
          <BenchButton
            key={m.species}
            member={m}
            choice={switchFor(m)}
            onChoose={onChoose}
            off={disabled || !controls}
          />
        ))}
      </div>
    </div>
  );
}
