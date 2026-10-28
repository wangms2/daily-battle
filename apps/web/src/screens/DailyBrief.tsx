// Daily brief (DESIGN.md §4.3): today's opponent (species only), your team,
// the lead, and today's single change, all on one screen.
import type { Difficulty } from '@daily-battle/ai/version';
import type { ScheduleFile } from '@daily-battle/gen/schedule';
import clsx from 'clsx';
import { useEffect, useState, type ReactNode } from 'react';
import { warmBattleWorker } from '../battle/backend';
import {
  activeFormat,
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
import { startBuilderMusic, stopBuilderMusic } from '../lib/audio';
import { finalStats } from '../lib/stats';
import { dayHeadline, streakLine, type DaySummary } from '../lib/results';
import { getSprite, preloadSprites } from '../lib/sprites';
import { InfoBody, InfoSheet } from '../sheets/InfoSheet';
import { ConfirmDialog } from '../sheets/misc';
import { SetCard, SetPicker } from '../sheets/SetPicker';
import type { DayChange, DayState } from '../state/schema';
import { Button, SectionLabel } from '../ui/bits';
import { CoachToggle, DifficultyPicker } from '../ui/Difficulty';
import { StarIcon } from '../ui/icons';
import { ItemIcon } from '../ui/ItemIcon';
import { MoveChips } from '../ui/MoveList';
import { PokemonTile } from '../ui/PokemonTile';
import { Sheet } from '../ui/Sheet';
import type { ShareModel } from '../lib/share';
import { DIFFICULTY_NAME } from '../lib/share';
import { OtherGames } from '../ui/OtherGames';
import { ShareButton } from '../ui/results';
import { useMediaQuery, useWide } from '../ui/useWide';

type Mode = { kind: 'view' } | { kind: 'edit' };

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
  difficulty = 'normal',
  onDifficulty,
  hardAvailable = true,
  coach,
  usingPracticeTeam = false,
  lost: lostProp,
}: {
  /** Practice runs use today's practice team instead of the weekly team. */
  usingPracticeTeam?: boolean;
  /** Today's tries (Normal's: the team is shared) are lost, so the team changes freely. */
  lost?: boolean;
  /**
   * The daily coach, where it's offered: on or off for the next battle, and what
   * turning it on costs (asked first), if anything.
   */
  coach?: { on: boolean; warning: string | null; onChange: (on: boolean) => void };
  /** The CPU difficulty for this game; each has its own tries and streak. */
  difficulty?: Difficulty;
  onDifficulty?: (d: Difficulty) => void;
  /** Whether this build has the Hard engine for the game. */
  hardAvailable?: boolean;
  /** Open with the team ready to change (after a loss). */
  initialEdit?: boolean;
  /** Throw the weekly team away and build a new one (ends the streak). */
  onDitch: () => void;
  /** Gen 5 on: the opponent sees your six before the battle, as you see theirs. */
  teamPreview?: boolean;
  /**
   * This difficulty is cleared today: runs are practice, and changes go to a
   * practice team for today (`onChange(null)` goes back to the weekly team).
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
  // Wide enough for the details panel beside the teams.
  const panelOn = useMediaQuery('(min-width: 1280px)');
  const opponent = schedule.days.find((d) => d.day === day)!;
  const lead =
    dayState.lead && team.some((s) => s.species === dayState.lead)
      ? dayState.lead
      : team[0]!.species;
  const [mode, setMode] = useState<Mode>({ kind: initialEdit && !practice ? 'edit' : 'view' });
  const [ditchOpen, setDitchOpen] = useState(false);
  const [infoFor, setInfoFor] = useState<{ species: string; foe: boolean } | null>(null);
  const [setView, setSetView] = useState<Slot | null>(null);
  // Wide screens: who the side panel shows (your lead until you pick another).
  const [focus, setFocus] = useState<{ species: string; foe: boolean } | null>(null);
  const [picker, setPicker] = useState<{
    slot: number;
    species: string;
    kind: DayChange['kind'];
  } | null>(null);
  const [pending, setPending] = useState<DayChange | null>(null);
  // Editing: the team slot whose change sheet is open.
  const [changing, setChanging] = useState<number | null>(null);
  const [coachAsk, setCoachAsk] = useState<string | null>(null);

  // The builder's track plays on while the lead is picked, until the day is decided.
  const playing = result.summary.status === 'none' || result.summary.status === 'pending';
  useEffect(() => {
    if (!playing) return;
    const format = activeFormat();
    startBuilderMusic(format);
    return () => stopBuilderMusic(format);
  }, [playing]);
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
  const bench = (slot: number) =>
    schedule.pool.species.filter(
      (s) => !team.some((t, i) => (i === slot ? t.species === s : sameSpecies(t.species, s))),
    );

  const describe = (c: DayChange) =>
    c.kind === 'replace'
      ? `${c.from.species} → ${c.to.species} (${findSet(c.to)?.label})`
      : `${c.from.species}: ${findSet(c.from)?.label} → ${findSet(c.to)?.label}`;

  // Tried today and not won: the streak is over, so the team can change freely.
  const lost = lostProp ?? result.summary.status === 'pending';
  const chip = 'rounded-chip px-3 py-1.5 text-[13px] font-semibold';
  const editChip = (label: string) => (
    <button
      type="button"
      onClick={() => setMode(editing ? { kind: 'view' } : { kind: 'edit' })}
      className={clsx(chip, 'bg-accent-soft text-soft-ink')}
      aria-pressed={editing}
    >
      {editing ? 'Cancel' : label}
    </button>
  );
  const changeChip = inProgress ? (
    <span className={clsx(chip, 'bg-surface-2 text-muted')}>Battle in progress</span>
  ) : practice ? (
    <span className="flex items-center gap-1.5">
      {usingPracticeTeam && !editing && (
        <button type="button" onClick={() => onChange(null)} className={clsx(chip, 'bg-surface-2')}>
          Back to my team
        </button>
      )}
      {editChip('Practice changes')}
    </span>
  ) : dayState.swapUsed && !lost ? (
    <span className={clsx(chip, 'bg-surface-2 text-muted')}>
      {dayState.changeOn ? `Change used on ${DIFFICULTY_NAME[dayState.changeOn]}` : 'Change used'}
    </span>
  ) : (
    editChip(lost ? 'Edit team' : '1 change left')
  );

  // Six tiles: 3×2 on phones, one row of six on wide screens, where the teams stack.
  // On wide screens the rows are a fixed, shorter height (the page centers them),
  // instead of stretching tall tiles over the whole window; on a short window they shrink.
  const sixGrid = clsx(
    'grid gap-2',
    wide
      ? 'h-52 min-h-36 shrink grid-cols-6 grid-rows-1'
      : 'min-h-0 flex-1 grid-cols-3 grid-rows-2',
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

  const opponentSection = (
    <section className={clsx('flex flex-col gap-2', wide ? 'min-h-0 shrink' : 'min-h-0 flex-1')}>
      <SectionLabel>Opponent</SectionLabel>
      <div className={sixGrid}>
        {opponent.team.map(({ species }) => (
          <PokemonTile
            key={species}
            species={species}
            label={`About ${species}${hints && canMega(species) ? ', can Mega Evolve' : ''}`}
            onTap={() =>
              panelOn ? setFocus({ species, foe: true }) : setInfoFor({ species, foe: true })
            }
            badge={hints && canMega(species) ? <MegaMark text="Can Mega Evolve" /> : undefined}
            hoverCard={wide && !panelOn ? hoverOf(species) : undefined}
          />
        ))}
      </div>
    </section>
  );

  const teamSection = (
    <section className={clsx('flex flex-col gap-2', wide ? 'min-h-0 shrink' : 'min-h-0 flex-1')}>
      <SectionLabel right={changeChip}>
        {usingPracticeTeam ? 'Practice team' : 'Your team'}
      </SectionLabel>
      <div className={sixGrid}>
        {team.map((slot, i) => {
          const isLead = slot.species === lead;
          return (
            <PokemonTile
              key={slot.species}
              species={slot.species}
              hoverCard={
                wide && !editing && !panelOn ? hoverOf(slot.species, slot.setId) : undefined
              }
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
                  ? `Change ${slot.species}`
                  : isLead
                    ? `${slot.species}, leading`
                    : `Lead with ${slot.species}`
              }
              onTap={editing ? () => setChanging(i) : () => onLead(slot.species)}
              onInfo={
                editing
                  ? undefined
                  : () =>
                      panelOn ? setFocus({ species: slot.species, foe: false }) : setSetView(slot)
              }
              infoLabel={`${slot.species}'s set`}
            />
          );
        })}
      </div>
      {editing && (
        <p className="shrink-0 text-center text-[13px] text-muted">
          Tap a Pokémon to change its set or swap it out
        </p>
      )}
    </section>
  );

  const { summary } = result;
  const start = editing ? (
    <Button variant="secondary" className="h-12 w-full shrink-0" onClick={() => setDitchOpen(true)}>
      {practice ? 'Build a practice team' : 'Pick a whole new team'}
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

  // The opponent's difficulty (and the coach), labelled, right where you start.
  const level = onDifficulty && !editing && (
    <div className={clsx('flex shrink-0 items-center gap-2', wide ? 'gap-3' : 'justify-between')}>
      <span className="text-[14px] font-semibold">Difficulty</span>
      <div className="flex items-center gap-1.5">
        {coach && (
          <CoachToggle
            on={coach.on}
            disabled={inProgress}
            onChange={(on) =>
              on && coach.warning ? setCoachAsk(coach.warning) : coach.onChange(on)
            }
          />
        )}
        <DifficultyPicker
          value={difficulty}
          onChange={onDifficulty}
          hardAvailable={hardAvailable}
          disabled={inProgress}
        />
      </div>
    </div>
  );

  // After a finished try: how today went, the streak, and Share.
  const decided = summary.status !== 'none' && summary.status !== 'pending';
  const strip = summary.status !== 'none' && !editing && (
    <section
      aria-label="Today’s result"
      className={clsx(
        'card flex shrink-0 items-center gap-3 px-3',
        wide ? 'min-h-16 py-2' : 'h-14',
      )}
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
      {/* A computer has room: the other games on the same line. */}
      {wide && decided && (
        <>
          <span aria-hidden className="h-10 w-px shrink-0 bg-line" />
          <OtherGames compact className="w-[360px] shrink-0" />
        </>
      )}
    </section>
  );
  // Once the day's decided, the other games are one tap away.
  const others = decided && !editing && !wide && <OtherGames compact className="shrink-0" />;

  // The panel's Pokémon: the one picked, else your lead.
  const panelSlot = (() => {
    const f = focus ?? { species: lead, foe: false };
    if (f.foe) return { species: f.species, foe: true, set: undefined };
    const slot = team.find((t) => t.species === f.species);
    if (!slot) return null;
    return { species: slot.species, foe: false, set: findSet(slot) };
  })();

  const vs = (
    <div className="flex shrink-0 items-center gap-3 text-[12px] font-bold tracking-[0.2em] text-muted">
      <span className="h-px flex-1 bg-line" />
      VS
      <span className="h-px flex-1 bg-line" />
    </div>
  );

  const topBar = renderTopBar(
    // Cancel sits on the change chip, next to the team being changed.
    editing ? <span>{practice ? 'Practice team' : 'Today’s change'}</span> : undefined,
  );

  return (
    <div className="game-ui flex h-full flex-col">
      {topBar}
      {wide ? (
        <main className="flex min-h-0 flex-1 gap-6 px-6 pb-6 pt-4">
          {/* Stacked as on phones: the opponent on top, your team nearer you. */}
          <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col justify-center gap-3">
            {opponentSection}
            {vs}
            {teamSection}
            {/* Two rows across the team's width: how today went, then how to play. */}
            <div className="mt-2 flex w-full flex-col gap-3">
              {strip}
              <div
                className={clsx(
                  'flex items-center gap-4',
                  level ? 'justify-between' : 'justify-center',
                )}
              >
                {level}
                <div className="w-full max-w-sm">{start}</div>
              </div>
            </div>
          </div>
          {/* A computer has room: details beside the teams instead of a sheet over them. */}
          {panelOn && !editing && panelSlot && (
            <aside
              aria-label={`${panelSlot.species} details`}
              className="card w-[340px] shrink-0 self-start overflow-y-auto p-4"
              style={{ maxHeight: '100%' }}
            >
              <p className="mb-2 flex items-baseline justify-between gap-2">
                <span className="home-serif text-[20px]">{panelSlot.species}</span>
                <span className="text-[12px] font-semibold tracking-wider text-muted uppercase">
                  {panelSlot.foe
                    ? 'Opponent'
                    : panelSlot.species === lead
                      ? 'Your lead'
                      : 'Your team'}
                </span>
              </p>
              {panelSlot.foe ? (
                <InfoBody species={panelSlot.species} showRoles={false} showPossibleSets={hints} />
              ) : (
                panelSlot.set && (
                  <SetCard species={panelSlot.species} set={panelSlot.set} badge={null} />
                )
              )}
            </aside>
          )}
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
          {level}
          {start}
        </main>
      )}

      <ConfirmDialog
        open={!!coachAsk}
        onOpenChange={(o) => !o && setCoachAsk(null)}
        title="Turn on the coach?"
        body={coachAsk ?? ''}
        confirm="Turn on"
        onConfirm={() => {
          setCoachAsk(null);
          coach?.onChange(true);
        }}
      />
      <InfoSheet
        species={infoFor?.species ?? null}
        open={!!infoFor}
        onOpenChange={(o) => !o && setInfoFor(null)}
        showRoles={!infoFor?.foe}
        showPossibleSets={!!infoFor?.foe && hints}
      />
      <Sheet
        open={changing !== null && !picker}
        onOpenChange={(o) => !o && setChanging(null)}
        title={changing !== null ? `Change ${team[changing]!.species}` : 'Change'}
        description="Give it another set, or swap in a Pokémon from your bench."
        scroll
      >
        {changing !== null && (
          <div className="space-y-3 pb-2">
            <Button
              variant="secondary"
              className="w-full"
              onClick={() =>
                setPicker({ slot: changing, species: team[changing]!.species, kind: 'set' })
              }
            >
              Another set for {team[changing]!.species}
            </Button>
            <SectionLabel>Or swap in</SectionLabel>
            <div className="grid grid-cols-3 gap-2">
              {bench(changing).map((species) => (
                <PokemonTile
                  key={species}
                  species={species}
                  label={`Bring in ${species}`}
                  onTap={() => setPicker({ slot: changing, species, kind: 'replace' })}
                />
              ))}
            </div>
          </div>
        )}
      </Sheet>
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
          const change: DayChange = {
            kind: picker.kind,
            slot: picker.slot,
            from: team[picker.slot]!,
            to: { species: picker.species, setId },
          };
          // Practice changes are free and for today only: no need to ask.
          if (practice) onChange(change);
          else setPending(change);
          setPicker(null);
          setChanging(null);
        }}
      />
      <ConfirmDialog
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
        title={lost ? 'Change your team?' : 'Use today’s change?'}
        body={
          pending
            ? lost
              ? `${describe(pending)}. Your streak is over for today, so change as much as you like; it sticks for the rest of the week.`
              : `${describe(pending)}. It’s the one change for all difficulties today, and it sticks for the rest of the week.`
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
        danger={!practice}
        title={practice ? 'Build a practice team?' : 'Start over with a new team?'}
        body={
          practice
            ? 'Pick any six from this week’s pool to practice with today. Your real team and streak stay as they are.'
            : result.streak > 0
              ? `You’ll build a new team from this week’s pool, and your ${result.streak}-day streak ends.`
              : 'You’ll build a new team from this week’s pool.'
        }
        confirm={practice ? 'Build team' : 'Pick new team'}
        cancel={practice ? 'Not now' : 'Keep my team'}
        onConfirm={() => {
          setDitchOpen(false);
          onDitch();
        }}
      />
    </div>
  );
}
