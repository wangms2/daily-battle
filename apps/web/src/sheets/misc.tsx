import { FORMATS, type FormatId } from '@daily-battle/data/formats';
import clsx from 'clsx';
import type { ReactNode } from 'react';
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
import { TextShareButton } from '../ui/results';
import { Sheet } from '../ui/Sheet';
import { Button, Switch, TypeBadge } from '../ui/bits';
import { CheckIcon, CloseIcon } from '../ui/icons';

/** What sets each game apart, for the welcome sheet's choice. */
const GAME_BLURB: Record<FormatId, string> = {
  gen3ou: 'Ruby, Sapphire, and Emerald',
  gen4ou: 'Diamond and Pearl',
  gen5ou: 'Black and White, with Team Preview',
  gen6ou: 'X and Y, with Mega Evolution and Fairy types',
};

/** The games, for phones: four side by side must fit a 360px-wide sheet, so the games' short names. */
const GAME_SHORT: Record<FormatId, string> = {
  gen3ou: 'RSE',
  gen4ou: 'DPPt',
  gen5ou: 'BW',
  gen6ou: 'XY, Megas',
};

export function WelcomeSheet({
  open,
  hints,
  onHints,
  format,
  onFormat,
  onDone,
  onAbout,
  review = false,
}: {
  open: boolean;
  hints: boolean;
  onHints: (v: boolean) => void;
  /** The game picked so far; unset until the player picks one. */
  format: FormatId | undefined;
  onFormat: (format: FormatId) => void;
  onDone: () => void;
  onAbout: () => void;
  /** Reopened from Settings as "How to play": the rules only, no game pick or hints switch. */
  review?: boolean;
}) {
  const rules = [
    ['Build a team', "Pick 6 of this week's 12 Pokémon. Your team carries over all week."],
    [
      'Beat today’s opponent',
      'A new opponent every day. You can see its Pokémon, but not their sets.',
    ],
    [
      'Win on your first try',
      'That earns a ⭐ and keeps your streak going. You can keep trying until you win.',
    ],
  ];
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onDone()}
      title={review ? 'How to play' : 'Welcome to Daily Battle'}
    >
      <ol className="space-y-3">
        {rules.map(([title, body], i) => (
          <li key={title} className="flex gap-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent-soft text-[14px] font-bold text-soft-ink">
              {i + 1}
            </span>
            <span>
              <span className="block text-[15px] font-semibold">{title}</span>
              <span className="block text-[14px] text-muted">{body}</span>
            </span>
          </li>
        ))}
      </ol>
      {review ? (
        <Button className="mt-4 w-full" onClick={onDone}>
          Got it
        </Button>
      ) : (
        <>
          <fieldset className="mt-3">
            <legend className="mb-2 text-[15px] font-semibold">
              Pick your game <span className="font-normal text-muted">· you can switch later</span>
            </legend>
            <div
              role="radiogroup"
              aria-label="Game"
              className="grid grid-cols-4 gap-1.5 sm:grid-cols-2 sm:gap-2"
            >
              {(Object.keys(FORMATS) as FormatId[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={format === id}
                  onClick={() => onFormat(id)}
                  className={clsx(
                    'card px-2 py-1.5 text-left sm:px-3',
                    format === id ? 'is-selected' : 'hover:bg-surface-2',
                  )}
                >
                  <span className="block text-[14px] font-semibold sm:text-[15px]">
                    {FORMATS[id].name} OU
                  </span>
                  <span className="block text-[12px] leading-snug text-muted">
                    <span className="sm:hidden">{GAME_SHORT[id]}</span>
                    <span className="hidden sm:inline">{GAME_BLURB[id]}</span>
                  </span>
                </button>
              ))}
            </div>
          </fieldset>
          <div className="mt-3 rounded-card bg-surface-2 px-4 py-2">
            <Switch
              checked={hints}
              onCheckedChange={onHints}
              label="Beginner hints"
              hint="Checklists and tips. You can turn these off in Settings."
            />
          </div>
          <Button className="mt-4 w-full" onClick={onDone} disabled={!format}>
            {format ? `Play ${FORMATS[format].name} OU` : 'Pick a game to start'}
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
      <div className="display text-[22px] tabular-nums">{value}</div>
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
  report,
  onAbout,
  onHowToPlay,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: Settings;
  onChange: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  /** The playtest report text, copied by the button. */
  report: string;
  onAbout: () => void;
  onHowToPlay: () => void;
}) {
  const speeds: Settings['battleSpeed'][] = ['slow', 'normal', 'fast'];
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Settings">
      <div className="divide-y divide-line">
        <Switch
          checked={settings.beginnerHints}
          onCheckedChange={(v) => onChange('beginnerHints', v)}
          label="Beginner hints"
          hint="Team checklist, weaknesses, and tips"
        />
        <div className="flex min-h-14 items-center justify-between gap-4 py-2">
          <span className="text-[15px] font-medium">Battle speed</span>
          <div
            className="flex rounded-xl bg-surface-2 p-1"
            role="radiogroup"
            aria-label="Battle speed"
          >
            {speeds.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={settings.battleSpeed === s}
                onClick={() => onChange('battleSpeed', s)}
                className={`min-h-9 rounded-lg px-3 text-[13px] font-semibold capitalize ${
                  settings.battleSpeed === s ? 'bg-surface text-ink shadow-card' : 'text-muted'
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
          hint="Battle effects and animated sprites"
        />
        <Switch
          checked={settings.sound}
          onCheckedChange={(v) => onChange('sound', v)}
          label="Sound"
          hint="Battle music and Pokémon cries"
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
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onHowToPlay}>
          How to play
        </Button>
        <Button variant="secondary" onClick={onAbout}>
          About and credits
        </Button>
        <TextShareButton text={report} variant="secondary" className="col-span-2">
          Copy playtest report
        </TextShareButton>
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-muted">
        An unofficial, free fan project, not affiliated with Nintendo or Smogon. The playtest report
        lists your days, team, and results, nothing else.
      </p>
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
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body: string;
  confirm: string;
  cancel?: string;
  onConfirm: () => void;
  children?: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title} description={body}>
      {children}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          {cancel}
        </Button>
        <Button onClick={onConfirm}>{confirm}</Button>
      </div>
    </Sheet>
  );
}
