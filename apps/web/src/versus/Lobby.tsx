// A room before it starts: who's in, the invite, and the host's settings.
// Everyone sees the same settings; only the host can change them.
import { DIFFICULTIES, type Difficulty } from '@daily-battle/ai/version';
import { FORMATS, formatInfo, genOf, type FormatId } from '@daily-battle/data/formats';
import { hasEngine } from '@daily-battle/engine-wasm/version';
import {
  LIVES_MAX,
  LIVES_MIN,
  TEAM_SIZES,
  TIMERS,
  type RoomCommand,
  type RoomSettings,
  type RoomView,
  type TeamSize,
  type TimerId,
} from '@daily-battle/versus';
import clsx from 'clsx';
import { useState } from 'react';
import { DIFFICULTY_NAME } from '../lib/share';
import { ConfirmDialog } from '../sheets/misc';
import { Button, SectionLabel } from '../ui/bits';
import { weekKey } from '@daily-battle/gen/dates';
import { IconStrip } from './bits';
import { Page } from './Page';

interface Option<T> {
  value: T;
  label: string;
  hint?: string;
}

/** A row of choices; read-only (the current choice as text) when `onChange` is left out. */
function Choice<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Option<T>[];
  onChange?: (v: T) => void;
}) {
  const current = options.find((o) => o.value === value);
  if (!onChange) {
    return (
      <div className="flex min-h-11 items-center justify-between gap-3">
        <span className="text-[15px] font-medium">{label}</span>
        <span className="text-right text-[15px]">
          {current?.label}
          {current?.hint && <span className="block text-[12px] text-muted">{current.hint}</span>}
        </span>
      </div>
    );
  }
  return (
    <fieldset className="space-y-1.5">
      <legend className="mb-1.5 text-[15px] font-medium">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
            className={clsx(
              'chip min-h-10 flex-1 px-3 py-1.5 text-[14px]',
              o.value === value ? 'is-selected card font-semibold' : 'hover:bg-surface-2',
            )}
          >
            {o.label}
            {o.hint && <span className="block text-[11px] font-normal text-muted">{o.hint}</span>}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

const FORMAT_OPTIONS: Option<FormatId>[] = (Object.keys(FORMATS) as FormatId[]).map((id) => ({
  value: id,
  label: `${formatInfo(id).name} OU`,
}));
const LIVES_OPTIONS: Option<number>[] = Array.from(
  { length: LIVES_MAX - LIVES_MIN + 1 },
  (_, i) => ({ value: LIVES_MIN + i, label: String(LIVES_MIN + i) }),
);
const TIMER_OPTIONS: Option<TimerId>[] = (Object.keys(TIMERS) as TimerId[]).map((id) => ({
  value: id,
  label: TIMERS[id].name,
  hint: `${TIMERS[id].perTurn}s a turn`,
}));
const POOL_OPTIONS: Option<RoomSettings['pool']>[] = [
  { value: 'random', label: 'New random pool' },
  { value: 'weekly', label: 'This week’s pool' },
];
const RIVAL_OPTIONS: Option<Difficulty>[] = DIFFICULTIES.map((d) => ({
  value: d,
  label: DIFFICULTY_NAME[d],
}));

export function Lobby({
  room,
  you,
  command,
  onStart,
  onRedraw,
  onLeave,
  onBack,
}: {
  room: RoomView;
  you: string;
  command: (c: RoomCommand) => void;
  onStart: () => void;
  onRedraw: () => void;
  onLeave: () => void;
  onBack: () => void;
}) {
  const host = room.hostId === you;
  // The rules and team sizes are set before a game.
  const editable = host && room.phase === 'lobby';
  const [leaving, setLeaving] = useState(false);
  const [removing, setRemoving] = useState<RoomView['players'][number] | null>(null);
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/#versus/${room.code}`;
  const set = (settings: Partial<RoomSettings>) => command({ type: 'settings', settings });
  const nextHost = room.players.find((p) => p.id !== you);
  const rival = room.settings.rivalDifficulty ?? 'normal';

  const invite = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Pokémon Daily versus room', url: link });
        return;
      }
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Share sheet dismissed, or no clipboard access: the code is on screen.
    }
  };

  return (
    <Page title={`Room ${room.code}`} back="Back" onBack={onBack}>
      <section className="card flex items-center justify-between gap-3 p-4">
        <div>
          <p className="text-[13px] text-muted">Room code</p>
          <p className="display text-[26px] tracking-[0.2em]" data-testid="room-code">
            {room.code}
          </p>
        </div>
        <Button variant="secondary" onClick={invite}>
          {copied ? 'Link copied' : 'Invite friends'}
        </Button>
      </section>

      <section className="space-y-2">
        <SectionLabel>Players · {room.players.length}</SectionLabel>
        <ul className="card divide-y divide-line" aria-label="Players">
          {room.players.map((p) => (
            <li key={p.id} className="flex min-h-14 items-center gap-3 px-4 py-2">
              <span
                className={clsx('size-2.5 shrink-0 rounded-full', p.online ? 'bg-good' : 'bg-line')}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold">
                  {p.name}
                  {p.id === you && <span className="font-normal text-muted"> (you)</span>}
                </span>
                <span className="block text-[12px] text-muted">
                  {[p.id === room.hostId && 'Host', !p.online && 'Away']
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              {editable ? (
                <select
                  className="h-9 rounded-btn border border-line bg-surface px-2 text-[14px]"
                  aria-label={`${p.name}’s team size`}
                  value={p.teamSize}
                  onChange={(e) =>
                    command({
                      type: 'teamSize',
                      player: p.id,
                      size: Number(e.target.value) as TeamSize,
                    })
                  }
                >
                  {TEAM_SIZES.map((n) => (
                    <option key={n} value={n}>
                      {n} Pokémon
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-[13px] text-muted">{p.teamSize} Pokémon</span>
              )}
              {host && p.id !== you && (
                <button
                  type="button"
                  className="h-9 rounded-btn px-2 text-[13px] text-bad hover:bg-surface-2"
                  onClick={() => setRemoving(p)}
                  aria-label={`Remove ${p.name}`}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
        {editable && (
          <p className="text-[12px] text-muted">
            Fewer Pokémon is a handicap for stronger players.
          </p>
        )}
      </section>

      <section className="space-y-2">
        <SectionLabel
          right={
            editable &&
            room.settings.pool === 'random' && (
              <button
                type="button"
                className="h-8 rounded-chip px-2 text-[13px] font-semibold text-accent hover:bg-surface-2"
                onClick={onRedraw}
              >
                Redraw
              </button>
            )
          }
        >
          The 12 · {room.pool?.source === 'weekly' ? 'this week’s pool' : 'random pool'}
        </SectionLabel>
        {room.pool && <IconStrip species={room.pool.species} label="The pool" />}
      </section>

      <section className="space-y-2">
        <SectionLabel>Rules</SectionLabel>
        <div className={clsx('card p-4', host ? 'space-y-4' : 'space-y-1')}>
          <Choice
            label="Game"
            value={room.settings.format}
            options={FORMAT_OPTIONS}
            onChange={editable ? (format) => set({ format }) : undefined}
          />
          <Choice
            label="Lives"
            value={room.settings.lives}
            options={LIVES_OPTIONS}
            onChange={editable ? (lives) => set({ lives }) : undefined}
          />
          <Choice
            label="Turn timer"
            value={room.settings.timer}
            options={TIMER_OPTIONS}
            onChange={editable ? (timer) => set({ timer }) : undefined}
          />
          <Choice
            label="Pokémon pool"
            value={room.settings.pool}
            options={POOL_OPTIONS}
            onChange={
              editable
                ? (pool) => set(pool === 'weekly' ? { pool, week: weekKey(new Date()) } : { pool })
                : undefined
            }
          />
          <Choice
            label="Rival (the AI for an odd player out)"
            value={rival}
            options={RIVAL_OPTIONS.filter(
              (o) => o.value !== 'hard' || hasEngine(genOf(room.settings.format)),
            )}
            onChange={editable ? (rivalDifficulty) => set({ rivalDifficulty }) : undefined}
          />
        </div>
      </section>

      <section className="space-y-2 pb-2">
        {room.phase === 'lobby' && (
          <>
            {host && (
              <Button className="w-full" disabled={room.players.length < 2} onClick={onStart}>
                Start the game
              </Button>
            )}
            <p className="text-center text-[13px] text-muted">
              {host
                ? room.players.length < 2
                  ? 'Invite at least one friend to start.'
                  : 'Everyone builds a team from the 12, then the rounds begin.'
                : 'Waiting for the host to start the game.'}
            </p>
          </>
        )}
        <Button variant="ghost" className="w-full" onClick={() => setLeaving(true)}>
          Leave room
        </Button>
      </section>

      <ConfirmDialog
        open={leaving}
        onOpenChange={setLeaving}
        title="Leave the room?"
        body={[
          host && nextHost
            ? `${nextHost.name} becomes the host. You can join again with the code.`
            : 'You can join again with the code while the room is open.',
        ]
          .filter(Boolean)
          .join(' ')}
        confirm="Leave"
        onConfirm={() => {
          setLeaving(false);
          onLeave();
        }}
      />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove ${removing?.name ?? ''}?`}
        body="They can join again with the code."
        confirm="Remove"
        onConfirm={() => {
          if (removing) command({ type: 'kick', player: removing.id });
          setRemoving(null);
        }}
      />
    </Page>
  );
}
