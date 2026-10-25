// Daily brief (DESIGN.md §4.3): today's opponent (species only), your team,
// the lead, and today's single change, all on one screen.
import type { ScheduleFile } from '@daily-battle/gen/schedule';
import clsx from 'clsx';
import { useEffect, useState, type ReactNode } from 'react';
import { warmBattleWorker } from '../battle/backend';
import {
  canMega,
  findSet,
  megaClash,
  megaFor,
  ONE_MEGA_MESSAGE,
  sameSpecies,
  speciesInfo,
  STAT_LABEL,
  type Slot,
} from '../lib/data';
import { finalStats } from '../lib/stats';
import { dayHeadline, streakLine, type DaySummary } from '../lib/results';
import { getSprite, preloadSprites } from '../lib/sprites';
import { InfoSheet } from '../sheets/InfoSheet';
import { ConfirmDialog } from '../sheets/misc';
import { SetPicker } from '../sheets/SetPicker';
import type { DayChange, DayState } from '../state/schema';
import { Button, SectionLabel } from '../ui/bits';
import { StarIcon } from '../ui/icons';
import { ItemIcon } from '../ui/ItemIcon';
import { MoveChips } from '../ui/MoveList';
import { PokemonTile } from '../ui/PokemonTile';
import type { ShareModel } from '../lib/share';
import { OtherGames } from '../ui/OtherGames';
import { ShareButton } from '../ui/results';
import { useWide } from '../ui/useWide';

type Mode =
  | { kind: 'view' }
  | { kind: 'edit' }
  /** Choosing who comes in for team slot `slot`. */
  | { kind: 'replace'; slot: number };

/** A small Mega mark on a tile's corner. */
function MegaMark({ text }: { text: string }) {
  return (
    <span className="mega-badge rounded-badge px-1.5 py-0.5 text-[10.5px] leading-none font-bold">
      {text}
    </span>
  );
}

export function DailyBrief({
  schedule,
  day,
  team,
  dayState,
  hints,
  onLead,
  onChange,
  onStart,
  inProgress = false,
  renderTopBar,
  result,
  practice = false,
  teamPreview = false,
  initialEdit = false,
  onDitch,
}: {
  /** Open with the team ready to change (after a loss). */
  initialEdit?: boolean;
  /** Throw the weekly team away and build a new one (ends the streak). */
  onDitch: () => void;
  /** Gen 5 on: the opponent sees your six before the battle, as you see theirs. */
  teamPreview?: boolean;
  /**
   * Today's counted tries are done: the change applies to the next practice run
   * only (and carries over if that run is won). `onChange(null)` undoes it.
   */
  practice?: boolean;
  /** Today's result so far, the share text, and time to the next opponent. */
  result: { summary: DaySummary; streak: number; share: ShareModel; countdown: string };
  schedule: ScheduleFile;
  day: string;
  team: Slot[];
  dayState: DayState;
  hints: boolean;
  onLead: (species: string) => void;
  onChange: (change: DayChange | null) => void;
  onStart: () => void;
  /** A battle today is still being played: Start resumes it, and the daily change waits. */
  inProgress?: boolean;
  renderTopBar: (left?: ReactNode) => ReactNode;
}) {
  const wide = useWide();
  const opponent = schedule.days.find((d) => d.day === day)!;
  const lead =
    dayState.lead && team.some((s) => s.species === dayState.lead)
      ? dayState.lead
      : team[0]!.species;
  const [mode, setMode] = useState<Mode>({ kind: initialEdit && !practice ? 'edit' : 'view' });
  const [ditchOpen, setDitchOpen] = useState(false);
  const [infoFor, setInfoFor] = useState<{ species: string; foe: boolean } | null>(null);
  const [setView, setSetView] = useState<Slot | null>(null);
  const [picker, setPicker] = useState<{
    slot: number;
    species: string;
    kind: DayChange['kind'];
  } | null>(null);
  const [pending, setPending] = useState<DayChange | null>(null);

  useEffect(() => {
    preloadSprites(opponent.team.map((s) => s.species));
  }, [opponent]);
  // Load the battle engine while the player looks at the opponent.
  useEffect(() => {
    if (typeof Worker !== 'undefined') warmBattleWorker();
  }, []);

  const editing = mode.kind !== 'view';
  // Pool Pokémon not on the team. Bringing one in must keep Species Clause:
  // no second form of a Pokémon that stays on the team.
  const bench = schedule.pool.species.filter(
    (s) =>
      !team.some((t, i) =>
        mode.kind === 'replace' && i === mode.slot ? t.species === s : sameSpecies(t.species, s),
      ),
  );

  const describe = (c: DayChange) =>
    c.kind === 'replace'
      ? `${c.from.species} → ${c.to.species} (${findSet(c.to)?.label})`
      : `${c.from.species}: ${findSet(c.from)?.label} → ${findSet(c.to)?.label}`;

  const practiceChange = practice ? dayState.practiceChange : undefined;
  // Tried today and not won: the streak is over, so the team can change freely.
  const lost = result.summary.status === 'pending';
  const changeChip = inProgress ? (
    <span className="rounded-chip bg-surface-2 px-3 py-1.5 text-[13px] font-semibold text-muted">
      Battle in progress
    </span>
  ) : practiceChange ? (
    <button
      type="button"
      onClick={() => onChange(null)}
      className="rounded-chip bg-accent-soft px-3 py-1.5 text-[13px] font-semibold text-soft-ink"
    >
      Undo practice change
    </button>
  ) : practice ? (
    <button
      type="button"
      onClick={() => setMode(editing ? { kind: 'view' } : { kind: 'edit' })}
      className="rounded-chip bg-accent-soft px-3 py-1.5 text-[13px] font-semibold text-soft-ink"
      aria-pressed={editing}
    >
      {editing ? 'Cancel' : 'Practice change'}
    </button>
  ) : dayState.swapUsed && !lost ? (
    <span className="rounded-chip bg-surface-2 px-3 py-1.5 text-[13px] font-semibold text-muted">
      Change used
    </span>
  ) : (
    <button
      type="button"
      onClick={() => setMode(editing ? { kind: 'view' } : { kind: 'edit' })}
      className="rounded-chip bg-accent-soft px-3 py-1.5 text-[13px] font-semibold text-soft-ink"
      aria-pressed={editing}
    >
      {editing ? 'Cancel' : lost ? 'Edit team' : '1 change left'}
    </button>
  );

  // Six tiles: 3×2 on phones, one row of six on wide screens, where the teams stack.
  // On wide screens the rows are a fixed, shorter height (the page centers them),
  // instead of stretching tall tiles over the whole window.
  const sixGrid = clsx(
    'grid gap-2',
    wide ? 'h-52 shrink-0 grid-cols-6 grid-rows-1' : 'min-h-0 flex-1 grid-cols-3 grid-rows-2',
  );

  /** What hovering a tile shows on desktop: base stats, and for your own, its set. */
  const hoverOf = (species: string, setId?: string) => {
    const info = speciesInfo(species);
    const set = setId ? findSet({ species, setId }) : undefined;
    // Your own Pokémon show the stats their set really has; the opponent's, its base stats.
    const shown = set ? finalStats(info.baseStats, set) : info.baseStats;
    return (
      <div className="space-y-1.5">
        <p className="text-[13px] font-semibold">{species}</p>
        <p className="text-[11px] text-muted">{set ? 'Final stats' : 'Base stats'}</p>
        <dl className="grid grid-cols-3 gap-x-2 gap-y-0.5 text-[12px] tabular-nums">
          {(['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const).map((k) => (
            <div key={k} className="flex justify-between gap-1">
              <dt className="text-muted">{STAT_LABEL[k]}</dt>
              <dd className="font-semibold">{shown[k]}</dd>
            </div>
          ))}
        </dl>
        {set && (
          <>
            <p className="text-[12px] text-muted">
              {set.label} · {set.item && <ItemIcon name={set.item} className="size-5" />}
              {set.item} · {set.ability}
            </p>
            <MoveChips moves={set.moves} />
          </>
        )}
      </div>
    );
  };

  const opponentSection =
    mode.kind === 'replace' ? (
      <section className="flex min-h-0 flex-1 flex-col gap-2">
        <SectionLabel>Who comes in for {team[mode.slot]!.species}?</SectionLabel>
        <div className={sixGrid}>
          {bench.map((species) => (
            <PokemonTile
              key={species}
              species={species}
              label={`Bring in ${species}`}
              onTap={() => setPicker({ slot: mode.slot, species, kind: 'replace' })}
              onInfo={() => setInfoFor({ species, foe: false })}
            />
          ))}
        </div>
      </section>
    ) : (
      <section className={clsx('flex flex-col gap-2', wide ? 'shrink-0' : 'min-h-0 flex-1')}>
        <SectionLabel>Opponent</SectionLabel>
        <div className={sixGrid}>
          {opponent.team.map(({ species }) => (
            <PokemonTile
              key={species}
              species={species}
              label={`About ${species}${hints && canMega(species) ? ', can Mega Evolve' : ''}`}
              onTap={() => setInfoFor({ species, foe: true })}
              badge={hints && canMega(species) ? <MegaMark text="Can Mega Evolve" /> : undefined}
              hoverCard={wide ? hoverOf(species) : undefined}
            />
          ))}
        </div>
      </section>
    );

  const teamSection = (
    <section className={clsx('flex flex-col gap-2', wide ? 'shrink-0' : 'min-h-0 flex-1')}>
      <SectionLabel right={changeChip}>
        {editing ? 'Pick a Pokémon to change' : 'Your team'}
      </SectionLabel>
      <div className={sixGrid}>
        {team.map((slot, i) => {
          const isLead = slot.species === lead;
          return (
            <PokemonTile
              key={slot.species}
              species={slot.species}
              showTypes={!editing}
              hoverCard={wide && !editing ? hoverOf(slot.species, slot.setId) : undefined}
              selected={!editing && isLead}
              badge={
                (!editing && isLead) || megaFor(slot.species, findSet(slot)) ? (
                  <span className="flex flex-col items-start gap-0.5">
                    {!editing && isLead && (
                      <span className="flex items-center gap-0.5 rounded-badge bg-gold px-1.5 py-0.5 text-[11px] font-bold text-on-gold">
                        <StarIcon width={11} height={11} /> Lead
                      </span>
                    )}
                    {megaFor(slot.species, findSet(slot)) && <MegaMark text="Mega" />}
                  </span>
                ) : undefined
              }
              label={
                editing
                  ? `${slot.species}`
                  : isLead
                    ? `${slot.species}, leading`
                    : `Lead with ${slot.species}`
              }
              onTap={editing ? undefined : () => onLead(slot.species)}
              onInfo={editing ? undefined : () => setSetView(slot)}
              infoLabel={`${slot.species}'s set`}
              footer={
                editing ? (
                  <div className="grid grid-cols-2 gap-1 px-1 pb-1">
                    <button
                      type="button"
                      onClick={() => setMode({ kind: 'replace', slot: i })}
                      className={clsx(
                        'min-h-8 rounded-lg text-[12px] font-semibold',
                        mode.kind === 'replace' && mode.slot === i
                          ? 'bg-accent text-on-accent'
                          : 'bg-surface-2',
                      )}
                    >
                      Swap
                    </button>
                    <button
                      type="button"
                      onClick={() => setPicker({ slot: i, species: slot.species, kind: 'set' })}
                      className="min-h-8 rounded-lg bg-surface-2 text-[12px] font-semibold"
                    >
                      Set
                    </button>
                  </div>
                ) : undefined
              }
            />
          );
        })}
      </div>
    </section>
  );

  const { summary } = result;
  const start = editing ? (
    <Button variant="secondary" className="h-12 w-full shrink-0" onClick={() => setDitchOpen(true)}>
      Pick a whole new team
    </Button>
  ) : (
    <Button className="h-12 w-full shrink-0" onClick={onStart}>
      {inProgress
        ? 'Resume battle'
        : summary.status === 'none'
          ? `Start · ${lead} leads`
          : summary.status === 'pending'
            ? `Try again · ${lead} leads`
            : 'Play again · practice'}
    </Button>
  );

  // After a finished try: how today went, the streak, and Share.
  const decided = summary.status !== 'none' && summary.status !== 'pending';
  const strip = summary.status !== 'none' && !editing && (
    <section
      aria-label="Today’s result"
      className="card flex h-14 shrink-0 items-center gap-3 px-3"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold">{dayHeadline(summary)}</p>
        <p className="truncate text-[12.5px] text-muted">
          {[streakLine(summary, result.streak), decided && `Next in ${result.countdown}`]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
      <ShareButton share={result.share} variant="secondary" className="h-9 shrink-0 px-4" />
    </section>
  );
  // Once the day's decided, the other games are one tap away.
  const others = decided && !editing && <OtherGames compact className="shrink-0" />;

  const vs = (
    <div className="flex shrink-0 items-center gap-3 text-[12px] font-bold tracking-[0.2em] text-muted">
      <span className="h-px flex-1 bg-line" />
      VS
      <span className="h-px flex-1 bg-line" />
    </div>
  );

  const topBar = renderTopBar(
    // Cancel sits on the change chip, next to the team being changed.
    editing ? <span>{practice ? 'Practice change' : 'Today’s change'}</span> : undefined,
  );

  return (
    <div className="flex h-full flex-col">
      {topBar}
      {wide ? (
        <main className="flex min-h-0 flex-1 flex-col gap-4 px-6 pb-6 pt-4">
          {/* Stacked as on phones: the opponent on top, your team nearer you. */}
          <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col justify-center gap-3">
            {opponentSection}
            {vs}
            {teamSection}
            <div className="mx-auto mt-2 flex w-full max-w-md flex-col gap-2">
              {strip}
              {others}
              {start}
            </div>
          </div>
        </main>
      ) : (
        <main className="flex min-h-0 flex-1 flex-col gap-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
          {opponentSection}
          {vs}
          {teamSection}
          {hints && !editing && !strip && (
            <p className="shrink-0 text-center text-[13px] text-muted">
              {teamPreview
                ? 'Tap to lead · ⓘ shows sets · They see your six too'
                : 'Tap a Pokémon to lead · ⓘ shows its set'}
            </p>
          )}
          {strip}
          {others}
          {start}
        </main>
      )}

      <InfoSheet
        species={infoFor?.species ?? null}
        open={!!infoFor}
        onOpenChange={(o) => !o && setInfoFor(null)}
        showRoles={!infoFor?.foe}
        showPossibleSets={!!infoFor?.foe && hints}
      />
      <SetPicker
        key={`view-${setView?.species}`}
        species={setView?.species ?? null}
        open={!!setView}
        onOpenChange={(o) => !o && setSetView(null)}
        currentSetId={setView?.setId}
        title={setView ? `${setView.species} · your set` : undefined}
      />
      <SetPicker
        key={`pick-${picker?.species}-${picker?.kind}`}
        species={picker?.species ?? null}
        open={!!picker}
        onOpenChange={(o) => !o && setPicker(null)}
        currentSetId={picker?.kind === 'set' ? team[picker.slot]!.setId : undefined}
        chooseLabel={picker?.kind === 'replace' ? 'Bring in' : 'Use this set'}
        // One Mega per team: the swap can't bring in a second Mega Stone.
        blocked={(setId) => {
          if (!picker) return undefined;
          const others = team.filter((_, i) => i !== picker.slot);
          const other = megaClash(others, { species: picker.species, setId });
          return other && `${ONE_MEGA_MESSAGE} ${other} has the Mega Stone.`;
        }}
        title={
          picker
            ? picker.kind === 'replace'
              ? `${picker.species} · pick a set`
              : `${picker.species} · change set`
            : undefined
        }
        onChoose={(setId) => {
          if (!picker) return;
          const from = team[picker.slot]!;
          setPending({
            kind: picker.kind,
            slot: picker.slot,
            from,
            to: { species: picker.species, setId },
          });
          setPicker(null);
        }}
      />
      <ConfirmDialog
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
        title={
          practice
            ? 'Change for this practice run?'
            : lost
              ? 'Change your team?'
              : 'Use today’s change?'
        }
        body={
          pending
            ? practice
              ? `${describe(pending)}. Just for your next practice run; win it and the change stays on your team.`
              : lost
                ? `${describe(pending)}. Your streak is over for today, so change as much as you like; it sticks for the rest of the week.`
                : `${describe(pending)}. This sticks for the rest of the week.`
            : ''
        }
        confirm="Make change"
        onConfirm={() => {
          if (pending) onChange(pending);
          setPending(null);
          setMode({ kind: 'view' });
        }}
      >
        {pending && (
          <div className="flex items-center justify-center gap-4">
            <img
              src={getSprite(pending.from.species)}
              alt={pending.from.species}
              className="pixelated h-16 w-16 object-contain"
            />
            <span className="text-[20px] text-muted">→</span>
            <img
              src={getSprite(pending.to.species)}
              alt={pending.to.species}
              className="pixelated h-16 w-16 object-contain"
            />
          </div>
        )}
      </ConfirmDialog>
      <ConfirmDialog
        open={ditchOpen}
        onOpenChange={setDitchOpen}
        title="Start over with a new team?"
        body={
          result.streak > 0
            ? `You’ll build a new team from this week’s pool, and your ${result.streak}-day streak ends.`
            : 'You’ll build a new team from this week’s pool.'
        }
        confirm="Pick new team"
        cancel="Keep my team"
        onConfirm={() => {
          setDitchOpen(false);
          onDitch();
        }}
      />
    </div>
  );
}
