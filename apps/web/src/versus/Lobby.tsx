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
import { HowToLink } from './HowTo';
import { ConfirmDialog } from '../sheets/misc';
import { Button, SectionLabel } from '../ui/bits';
import { weekKey } from '@daily-battle/gen/dates';
import { getSprite } from '../lib/sprites';
import { CloseIcon } from '../ui/icons';
import { Sheet } from '../ui/Sheet';
import { useWide } from '../ui/useWide';
import { useSpritesReady } from '../ui/useSpritesReady';
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
      <div className="flex min-h-10 items-center justify-between gap-3 py-1">
        <span className="text-[15px] font-medium">{label}</span>
        <span className="text-right text-[15px]">
          {current?.label}
          {current?.hint && <span className="block text-[12px] text-muted">{current.hint}</span>}
        </span>
      </div>
    );
  }
  return (
    <fieldset className="space-y-1">
      <legend className="mb-1 text-[14px] font-medium">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
            className={clsx(
              'chip chunky-chip min-h-9 flex-1 px-2.5 py-1 text-[14px]',
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
  onHowTo,
}: {
  room: RoomView;
  you: string;
  command: (c: RoomCommand) => void;
  onStart: () => void;
  onRedraw: () => void;
  onLeave: () => void;
  onBack: () => void;
  onHowTo?: () => void;
}) {
  const host = room.hostId === you;
  // The rules and team sizes are set before a game.
  const editable = host && room.phase === 'lobby';
  const [leaving, setLeaving] = useState(false);
  const [removing, setRemoving] = useState<RoomView['players'][number] | null>(null);
  const [copied, setCopied] = useState(false);
  const [editingRules, setEditingRules] = useState(false);
  const wide = useWide();
  const pool = useSpritesReady(room.pool?.species ?? [], 'icon');
  // A big room gets compact rows.
  const dense = room.players.length > 4;
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

  const lives = room.settings.lives;
  // The rules in one line; the host edits them in a sheet.
  const rules = [
    `${formatInfo(room.settings.format).name} OU`,
    `${lives} ${lives === 1 ? 'life' : 'lives'}`,
    `${TIMERS[room.settings.timer].perTurn}s a turn`,
    room.settings.pool === 'weekly' ? 'This week’s 12' : 'Random 12',
    `Rival ${DIFFICULTY_NAME[rival]}`,
  ];

  // The room's rules as choices: controls for the host, read-only rows otherwise.
  const ruleChoices = (edit: boolean) => (
    <>
      <Choice
        label="Game"
        value={room.settings.format}
        options={FORMAT_OPTIONS}
        onChange={edit ? (format) => set({ format }) : undefined}
      />
      <Choice
        label="Lives"
        value={room.settings.lives}
        options={LIVES_OPTIONS}
        onChange={edit ? (l) => set({ lives: l }) : undefined}
      />
      <Choice
        label="Turn timer"
        value={room.settings.timer}
        options={TIMER_OPTIONS}
        onChange={edit ? (timer) => set({ timer }) : undefined}
      />
      <Choice
        label="Pokémon pool"
        value={room.settings.pool}
        options={POOL_OPTIONS}
        onChange={
          edit
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
        onChange={edit ? (rivalDifficulty) => set({ rivalDifficulty }) : undefined}
      />
    </>
  );

  // The page scrolls if it needs to; a long list of players scrolls on its own.
  return (
    <Page
      title={`Room ${room.code}`}
      back="Back"
      onBack={onBack}
      tight
      right={
        <button
          type="button"
          onClick={() => setLeaving(true)}
          aria-label="Leave room"
          className="h-10 rounded-full px-2 text-[15px] font-semibold text-white/90 hover:bg-white/10"
        >
          Leave
        </button>
      }
    >
      {/* Wide screens: the players on the left, the room and its rules on the right. */}
      <div className="space-y-3 wide:grid wide:grid-cols-2 wide:items-start wide:gap-x-8 wide:gap-y-3 wide:space-y-0">
        <section className="card flex shrink-0 items-center justify-between gap-3 px-4 py-1 wide:col-start-2">
          <p className="flex items-baseline gap-2">
            <span className="text-[13px] text-muted">Code</span>
            <span className="home-serif text-[22px] tracking-[0.18em]" data-testid="room-code">
              {room.code}
            </span>
          </p>
          <Button variant="secondary" className="h-9 px-3" onClick={invite}>
            {copied ? 'Link copied' : 'Invite friends'}
          </Button>
        </section>

        <section className="space-y-1 wide:col-start-1 wide:row-span-4 wide:row-start-1">
          <SectionLabel right={onHowTo && <HowToLink onClick={onHowTo} />}>
            Players · {room.players.length}
          </SectionLabel>
          {/* Up to four, roomy rows and everyone in view. A bigger room gets one-line
            rows with small steppers, so a full room of 8 still fits. */}
          <ul className="card divide-y divide-line" aria-label="Players">
            {room.players.map((p) => (
              <li
                key={p.id}
                className={clsx(
                  'flex items-center gap-3 px-3',
                  dense ? 'min-h-8 py-0.5' : 'min-h-14 py-2',
                )}
              >
                <span
                  className={clsx(
                    'size-2.5 shrink-0 rounded-full',
                    p.online ? 'bg-good' : 'bg-line',
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={clsx(
                      'block truncate font-semibold',
                      dense ? 'text-[14px]' : 'text-[15px]',
                    )}
                  >
                    {p.name}
                    {p.id === you && <span className="font-normal text-muted"> (you)</span>}
                    {/* One line in a big room: the tags follow the name. */}
                    {dense && (p.id === room.hostId || !p.online) && (
                      <span className="text-[12px] font-normal text-muted">
                        {' · '}
                        {[p.id === room.hostId && 'Host', !p.online && 'Away']
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    )}
                  </span>
                  {!dense && (p.id === room.hostId || !p.online) && (
                    <span className="block text-[12px] text-muted">
                      {[p.id === room.hostId && 'Host', !p.online && 'Away']
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  )}
                </span>
                {/* Everyone's size in the same place and style; only the ones you can
                  change have − and + (the others keep their space, so they line up). */}
                <SizeStepper
                  compact={dense}
                  name={p.name}
                  size={p.teamSize}
                  onChange={
                    editable || (p.id === you && room.phase === 'lobby')
                      ? (size) => command({ type: 'teamSize', player: p.id, size })
                      : undefined
                  }
                />
                {/* The host's column of Remove buttons, kept on their own row too, so the
                  steppers line up. */}
                {host && (
                  <span className={clsx('flex shrink-0 justify-end', dense ? 'w-8' : 'w-16')}>
                    {p.id !== you && (
                      <button
                        type="button"
                        className={clsx(
                          'grid place-items-center rounded-btn text-[13px] text-bad hover:bg-surface-2',
                          dense ? 'size-7' : 'h-9 px-2',
                        )}
                        onClick={() => setRemoving(p)}
                        aria-label={`Remove ${p.name}`}
                      >
                        {/* A big room's rows: a small ✕ instead of the word. */}
                        {dense ? <CloseIcon className="size-4" aria-hidden /> : 'Remove'}
                      </button>
                    )}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-1 wide:col-start-2">
          <SectionLabel
            right={
              editable &&
              room.settings.pool === 'random' && (
                <button
                  type="button"
                  className="h-7 rounded-chip px-2 text-[13px] font-semibold text-accent hover:bg-surface-2"
                  onClick={onRedraw}
                >
                  Redraw
                </button>
              )
            }
          >
            The 12 · {room.pool?.source === 'weekly' ? 'this week’s pool' : 'random pool'}
          </SectionLabel>
          {room.pool && (
            <ul className="grid grid-cols-12 gap-0.5" aria-label="The pool">
              {/* All 12 appear together: a redraw keeps the old pool up until every
                new sprite has loaded, and the first draw holds empty spaces. */}
              {(pool ?? room.pool.species.map(() => '')).map((sp, i) => (
                <li key={sp || i} title={sp || undefined}>
                  {sp ? (
                    <img
                      src={getSprite(sp, 'icon')}
                      alt={sp}
                      className="pixelated aspect-[4/3] w-full object-contain"
                    />
                  ) : (
                    <span className="block aspect-[4/3] w-full" />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {wide ? (
          // A computer has room: the rules themselves, on the page.
          <section
            className={clsx(
              'card px-4 wide:col-start-2',
              editable ? 'space-y-3 py-3' : 'divide-y divide-line py-1',
            )}
            aria-label="Rules"
          >
            <p className="pt-1 text-[12px] font-semibold tracking-wider text-muted uppercase">
              Rules
            </p>
            {ruleChoices(editable)}
          </section>
        ) : (
          <section
            className="card flex items-center gap-3 px-4 py-1.5 wide:col-start-2"
            aria-label="Rules"
          >
            <p className="min-w-0 flex-1 text-[14px] leading-snug">
              <span className="block text-[12px] font-semibold tracking-wider text-muted uppercase">
                Rules
              </span>
              {rules.join(' · ')}
            </p>
            {editable && (
              <Button
                variant="secondary"
                className="h-9 shrink-0 px-3"
                onClick={() => setEditingRules(true)}
              >
                Edit
              </Button>
            )}
          </section>
        )}

        <section className="space-y-1 wide:col-start-2">
          {room.phase === 'lobby' && host && (
            <Button className="w-full" disabled={room.players.length < 2} onClick={onStart}>
              Start the game
            </Button>
          )}
          {/* A note only when there's something to wait for (Leave is up in the header). */}
          {room.phase === 'lobby' && (!host || room.players.length < 2) && (
            <p className="text-center text-[13px] text-muted">
              {host
                ? 'Invite at least one friend to start.'
                : 'Waiting for the host to start the game.'}
            </p>
          )}
        </section>
      </div>

      <Sheet open={editingRules} onOpenChange={setEditingRules} title="Rules">
        <div className="space-y-3">{ruleChoices(true)} </div>
        <Button className="mt-4 w-full" onClick={() => setEditingRules(false)}>
          Done
        </Button>
      </Sheet>
      <ConfirmDialog
        open={leaving}
        onOpenChange={setLeaving}
        danger
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
        danger
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

/**
 * A player's team size (a handicap): − and + around it, from 6 down to 3. Without
 * `onChange` it's read-only: the same number, with the buttons' space kept so every
 * player's size lines up.
 */
function SizeStepper({
  name,
  size,
  onChange,
  compact = false,
}: {
  /** Smaller, for the one-line rows of a big room. */
  compact?: boolean;
  /** The player's name, for the labels. */
  name: string;
  size: TeamSize;
  onChange?: (size: TeamSize) => void;
}) {
  const min = Math.min(...TEAM_SIZES);
  const max = Math.max(...TEAM_SIZES);
  const step = (d: number) => onChange?.(Math.min(max, Math.max(min, size + d)) as TeamSize);
  const box = compact ? 'size-6' : 'size-8';
  // Light round buttons, no 3D edge: the number is what matters. Smaller in a big room.
  const btn = clsx(
    'grid place-items-center rounded-full bg-surface-2 leading-none font-semibold text-accent active:bg-line disabled:opacity-30',
    box,
    compact ? 'text-[17px]' : 'text-[20px]',
  );
  const button = (d: number, label: string, text: string, off: boolean) =>
    onChange ? (
      <button
        type="button"
        className={btn}
        disabled={off}
        onClick={() => step(d)}
        aria-label={label}
      >
        {text}
      </button>
    ) : (
      <span className={box} aria-hidden />
    );
  return (
    <div
      className="flex shrink-0 items-center gap-1"
      role="group"
      aria-label={`${name}’s team size: ${size} Pokémon`}
    >
      {button(-1, `Fewer Pokémon for ${name}`, '−', size <= min)}
      {compact ? (
        // A big room's one-line rows: the number, then "Pokémon" in the names' font.
        <span className="flex w-[4.75rem] items-baseline justify-center gap-1 leading-none">
          <span className="home-serif text-[16px] tabular-nums">{size}</span>
          <span className="text-[13px] text-muted">Pokémon</span>
        </span>
      ) : (
        <span className="grid w-12 justify-items-center leading-none">
          <span className="home-serif text-[18px] tabular-nums">{size}</span>
          <span className="text-[11px] text-muted">Pokémon</span>
        </span>
      )}
      {button(1, `More Pokémon for ${name}`, '+', size >= max)}
    </div>
  );
}
