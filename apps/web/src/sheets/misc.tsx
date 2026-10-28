import { useState, type ReactNode } from 'react';
import clsx from 'clsx';
import type { SetEntry } from '@daily-battle/data';
import {
  CHECK_ITEMS,
  defenseGaps,
  offenseGaps,
  sharedWeaknesses,
  type Checklist,
} from '../lib/data';
import { getSprite } from '../lib/sprites';
import type { Stats } from '../lib/results';
import type { Settings } from '../state/schema';
import { useAccount } from '../state/context';
import { Sheet } from '../ui/Sheet';
import { TrainerRow, TrainerSection } from './Trainer';
import { Button, Switch, TypeBadge } from '../ui/bits';
import { CheckIcon, ChevronIcon, CloseIcon } from '../ui/icons';

export function WelcomeSheet({
  open,
  hints,
  onHints,
  onDone,
  onAbout,
  onTutorial,
  review = false,
}: {
  open: boolean;
  hints: boolean;
  onHints: (v: boolean) => void;
  onDone: () => void;
  onAbout: () => void;
  /** Opens the Gen 3 lessons (DESIGN.md §22). */
  onTutorial: () => void;
  /** Reopened from Settings as "How to play": the rules only, no hints switch. */
  review?: boolean;
}) {
  const rules = [
    ['Build a team', 'Pick 6 of this week’s 12 for the week.'],
    ['Beat today’s opponent', 'A new one daily. Its sets stay hidden.'],
    ['Win on your first try', 'A ⭐ and your streak. Win later for a ✓.'],
  ];
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onDone()}
      title={review ? 'How to play' : 'Welcome to Pokémon Daily'}
    >
      <ol className="space-y-2">
        {rules.map(([title, body], i) => (
          <li key={title} className="flex gap-3">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-[13px] font-bold text-soft-ink">
              {i + 1}
            </span>
            <span>
              <span className="block text-[15px] font-semibold leading-snug">{title}</span>
              <span className="block text-[13px] leading-snug text-muted">{body}</span>
            </span>
          </li>
        ))}
      </ol>
      <section
        aria-label="New to competitive Pokémon?"
        className="mt-3 rounded-card border border-line px-4 py-3"
      >
        <p className="text-[15px] font-semibold">New to competitive Pokémon?</p>
        <p className="text-[13px] leading-snug text-muted">
          Start with Gen 3. It has lessons and a coach.
        </p>
        <Button variant="secondary" className="mt-2 w-full" onClick={onTutorial}>
          Start the tutorial
        </Button>
      </section>
      {review ? (
        <Button className="mt-4 w-full" onClick={onDone}>
          Got it
        </Button>
      ) : (
        <>
          <div className="mt-3 rounded-card bg-surface-2 px-4 py-2">
            <Switch
              checked={hints}
              onCheckedChange={onHints}
              label="Beginner hints"
              hint="Checklists and tips. You can turn these off in Settings."
            />
          </div>
          <Button className="mt-3 w-full" onClick={onDone}>
            Let’s play
          </Button>
          <p className="mt-3 text-center text-[12px] text-muted">
            An unofficial fan project.{' '}
            <button type="button" onClick={onAbout} className="font-semibold text-accent underline">
              About and credits
            </button>
          </p>
        </>
      )}
    </Sheet>
  );
}

function StatTile({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="rounded-card bg-surface-2 px-3 py-3 text-center">
      <div className="home-serif text-[24px] tabular-nums">{value}</div>
      <div className="text-[12px] text-muted">{label}</div>
    </div>
  );
}

export function StatsSheet({
  open,
  onOpenChange,
  stats,
  game,
  todayLabel,
  countdown,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stats: Stats;
  /** "Gen 5 OU": the game these stats are for. */
  game?: string;
  todayLabel: string;
  countdown: string;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={game ? `Your ${game} stats` : 'Your stats'}
    >
      <div className="card px-4 py-3">
        <div className="text-[13px] text-muted">Today</div>
        <div className="text-[16px] font-semibold">{todayLabel}</div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <StatTile value={stats.streak} label="Streak" />
        <StatTile value={stats.bestStreak} label="Best streak" />
        <StatTile value={`⭐ ${stats.firstTryWins}`} label="First-try wins" />
        <StatTile value={`${stats.firstTryRate}%`} label="First-try rate" />
        <StatTile value={stats.daysPlayed} label="Days played" />
        <StatTile
          value={stats.triesPerClear === null ? '–' : stats.triesPerClear.toFixed(1)}
          label="Tries per clear"
        />
      </div>
      <p className="mt-4 text-center text-[14px] text-muted">
        Next opponent in <span className="font-semibold text-ink tabular-nums">{countdown}</span>
      </p>
    </Sheet>
  );
}

/** A 0–100% slider for one kind of sound (Settings). */
function VolumeSlider({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  /** 0 to 1. */
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  const pct = Math.round(value * 100);
  return (
    <label className={clsx('flex min-h-12 items-center gap-4 py-2', disabled && 'opacity-50')}>
      <span className="w-32 shrink-0 text-[15px] font-medium">{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={pct}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.currentTarget.value) / 100)}
        aria-valuetext={`${pct}%`}
        className="h-9 min-w-0 flex-1 accent-[var(--accent)]"
      />
      <span className="w-10 shrink-0 text-right text-[13px] text-muted tabular-nums" aria-hidden>
        {pct}%
      </span>
    </label>
  );
}

export function SettingsSheet({
  open,
  onOpenChange,
  settings,
  onChange,
  onAbout,
  onHowToPlay,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: Settings;
  onChange: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  onAbout: () => void;
  onHowToPlay: () => void;
}) {
  const speeds: Settings['battleSpeed'][] = ['slow', 'normal', 'fast'];
  const account = useAccount();
  const [erasing, setErasing] = useState(false);
  // The Trainer page opens in place of the list, with a way back; closing resets it.
  const [page, setPage] = useState<'main' | 'trainer' | 'startOver'>('main');
  const close = (o: boolean) => {
    if (!o) setPage('main');
    onOpenChange(o);
  };
  const back = (
    <button
      type="button"
      onClick={() => setPage('main')}
      className="-ml-1 flex h-9 items-center gap-0.5 text-[14px] font-semibold text-accent"
    >
      <ChevronIcon className="size-4 rotate-180" aria-hidden />
      Settings
    </button>
  );
  return (
    <Sheet
      open={open}
      onOpenChange={close}
      title={page === 'trainer' ? 'Trainer' : page === 'startOver' ? 'Start over' : 'Settings'}
      size="md"
    >
      {page === 'trainer' ? (
        <div>
          {back}
          <TrainerSection name={settings.name} onRename={(name) => onChange('name', name)} />
        </div>
      ) : page === 'startOver' ? (
        <div className="grid gap-3">
          {back}
          <p className="text-[15px]">
            This erases everything on this device: your name, teams, streaks, lessons and settings.
            The game starts fresh, like the first time you opened it.
          </p>
          {account.name && (
            <p className="text-[14px] text-muted">
              You’ll be signed out of 🔒 {account.name}. Its saved copy stays on the server, so
              signing in again brings it back. To erase that too, delete the account in Trainer
              first.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setPage('main')}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={erasing}
              onClick={() => {
                setErasing(true);
                void account.startOver();
              }}
            >
              {erasing ? 'Erasing…' : 'Erase and start over'}
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* Two columns on wide screens: the game on the left, sound on the right. */}
          <div className="wide:grid wide:grid-cols-2 wide:gap-8">
            <div className="divide-y divide-line">
              <TrainerRow name={settings.name} onOpen={() => setPage('trainer')} />
              <Switch
                checked={settings.beginnerHints}
                onCheckedChange={(v) => onChange('beginnerHints', v)}
                label="Beginner hints"
              />
              <div className="flex min-h-14 items-center justify-between gap-4 py-2">
                <span className="text-[15px] font-medium">Battle speed</span>
                <div className="seg flex p-1" role="radiogroup" aria-label="Battle speed">
                  {speeds.map((s) => (
                    <button
                      key={s}
                      type="button"
                      role="radio"
                      aria-checked={settings.battleSpeed === s}
                      onClick={() => onChange('battleSpeed', s)}
                      className={`min-h-9 rounded-lg px-3 text-[13px] font-semibold capitalize ${
                        settings.battleSpeed === s
                          ? 'bg-surface text-ink shadow-card'
                          : 'text-muted'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <Switch
                checked={settings.animations}
                onCheckedChange={(v) => onChange('animations', v)}
                label="Animations"
              />
            </div>
            <div className="divide-y divide-line border-t border-line wide:border-t-0">
              <Switch
                checked={settings.sound}
                onCheckedChange={(v) => onChange('sound', v)}
                label="Sound"
              />
              <VolumeSlider
                label="Music volume"
                value={settings.musicVolume}
                disabled={!settings.sound}
                onChange={(v) => onChange('musicVolume', v)}
              />
              <VolumeSlider
                label="Effects volume"
                value={settings.effectsVolume}
                disabled={!settings.sound}
                onChange={(v) => onChange('effectsVolume', v)}
              />
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={onHowToPlay}>
              How to play
            </Button>
            <Button variant="secondary" onClick={onAbout}>
              About
            </Button>
          </div>
          <button
            type="button"
            onClick={() => setPage('startOver')}
            className="mt-3 h-9 text-[13px] font-semibold text-muted hover:text-bad"
          >
            Start over…
          </button>
        </>
      )}
    </Sheet>
  );
}

export function TeamCheckSheet({
  open,
  onOpenChange,
  team,
  sets,
  checks,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  team: string[];
  /** The team's sets, for attack coverage. */
  sets: SetEntry[];
  checks: Checklist;
}) {
  const shared = sharedWeaknesses(team);
  const noHit = team.length ? offenseGaps(sets) : [];
  const exposed = defenseGaps(team);
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Team checklist">
      <ul className="space-y-1.5">
        {CHECK_ITEMS.map(({ key, label, why }) => (
          <li key={key} className="flex items-center gap-3">
            <span
              className={`grid size-6 shrink-0 place-items-center rounded-full ${
                checks[key] ? 'bg-good/15 text-good' : 'bg-surface-2 text-muted'
              }`}
            >
              {checks[key] ? (
                <CheckIcon width={14} height={14} />
              ) : (
                <CloseIcon width={14} height={14} />
              )}
            </span>
            <span className="text-[14px]">
              <span className="font-semibold">{label}</span>{' '}
              <span className="text-muted">· {why}</span>
            </span>
          </li>
        ))}
      </ul>
      {noHit.length > 0 && (
        <>
          <h3 className="mt-4 mb-1.5 text-[13px] font-semibold text-muted">
            No super-effective hit on
          </h3>
          <div className="flex flex-wrap gap-1">
            {noHit.map((t) => (
              <TypeBadge key={t} type={t} />
            ))}
          </div>
        </>
      )}
      {exposed.length > 0 && (
        <>
          <h3 className="mt-4 mb-1.5 text-[13px] font-semibold text-muted">
            Weak, and nothing resists
          </h3>
          <ul className="space-y-1">
            {exposed.map(({ type, species }) => (
              <li key={type} className="flex items-center gap-2 text-[13px]">
                <TypeBadge type={type} />
                <span className="truncate text-muted">{species.join(', ')}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <h3 className="mt-4 mb-2 text-[13px] font-semibold text-muted">Shared weaknesses</h3>
      {shared.length ? (
        <ul className="space-y-2">
          {shared.slice(0, 4).map(({ type, species }) => (
            <li key={type} className="flex items-center gap-3">
              <span className="w-[4.5rem]">
                <TypeBadge type={type} />
              </span>
              <span className="text-[14px] font-semibold">{species.length} weak</span>
              <span className="ml-auto flex">
                {species.map((s) => (
                  <img
                    key={s}
                    src={getSprite(s, 'icon')}
                    alt={s}
                    title={s}
                    className="pixelated h-7 w-9 object-contain"
                  />
                ))}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[14px] text-muted">
          No type hits more than one of your Pokémon super-effectively.
        </p>
      )}
    </Sheet>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirm,
  cancel = 'Cancel',
  onConfirm,
  danger = false,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body: string;
  confirm: string;
  cancel?: string;
  onConfirm: () => void;
  /** A step that loses something (a battle, a streak, a seat): the confirm is red. */
  danger?: boolean;
  children?: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title} description={body}>
      {children}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          {cancel}
        </Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
          {confirm}
        </Button>
      </div>
    </Sheet>
  );
}
