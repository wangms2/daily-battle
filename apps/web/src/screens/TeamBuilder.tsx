// Weekly team builder (DESIGN.md §12.2a). Phone: one screen, no scrolling:
// the recommended team, the 4×3 pool, the checklist, the tray, and Lock in.
// Wide: compact pool cards on the left, the team panel on the right.
import type { ScheduleFile } from '@daily-battle/gen/schedule';
import clsx from 'clsx';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  activeFormat,
  CHECK_ITEMS,
  checklist,
  findSet,
  megaClash,
  megaFor,
  ONE_MEGA_MESSAGE,
  randomTeam,
  sameSpecies,
  topSet,
  type Slot,
} from '../lib/data';
import { startBuilderMusic, stopBuilderMusic } from '../lib/audio';
import { getSprite } from '../lib/sprites';
import { ConfirmDialog, TeamCheckSheet } from '../sheets/misc';
import { InfoSheet } from '../sheets/InfoSheet';
import { SetPicker } from '../sheets/SetPicker';
import { Button, SectionLabel } from '../ui/bits';
import { CheckIcon, ChevronIcon, CloseIcon, DiceIcon } from '../ui/icons';
import { PokemonRow, PokemonTile } from '../ui/PokemonTile';
import { DetailsPanel } from '../ui/DetailsPanel';
import { useWide } from '../ui/useWide';

export function TeamBuilder({
  schedule,
  hints,
  onLock,
  topBar,
  notice,
  size = 6,
  lockBody = 'It’s yours for the week. You get 1 change per day.',
}: {
  schedule: ScheduleFile;
  hints: boolean;
  onLock: (team: Slot[]) => void;
  topBar: ReactNode;
  /** A one-off message above the builder, e.g. that the week was refreshed. */
  notice?: string;
  /** How many to pick: 6, or fewer for a handicapped versus player. */
  size?: number;
  /** What locking in means, on the confirmation. */
  lockBody?: string;
}) {
  const wide = useWide();
  // Its game's own music, quieter than a battle's, while the team is being picked (DESIGN.md §21).
  useEffect(() => {
    const format = activeFormat();
    startBuilderMusic(format);
    return () => stopBuilderMusic(format);
  }, []);
  const [noticeShown, setNoticeShown] = useState(true);
  const noticeBar = notice && noticeShown && (
    <div
      role="status"
      className="flex shrink-0 items-start gap-2 rounded-chip bg-accent-soft px-3 py-2 text-[13px] leading-snug font-medium text-soft-ink"
    >
      <span className="flex-1">{notice}</span>
      <button
        type="button"
        aria-label="Dismiss"
        className="-m-1 grid size-7 shrink-0 place-items-center"
        onClick={() => setNoticeShown(false)}
      >
        <CloseIcon width={14} height={14} />
      </button>
    </div>
  );
  const [team, setTeam] = useState<Slot[]>([]);
  const [popped, setPopped] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const [infoFor, setInfoFor] = useState<string | null>(null);
  // The set picker: for a team member (change its set) or a Pokémon being added.
  const [picker, setPicker] = useState<{ species: string; adding: boolean } | null>(null);
  const setPickerFor = (species: string | null) =>
    setPicker(species ? { species, adding: false } : null);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // undo: the team before; reroll: offers another random team in place.
  const [snack, setSnack] = useState<{ message: string; undo?: Slot[]; reroll?: boolean } | null>(
    null,
  );
  // Wide: the Pokémon in the details panel, and the set previewed for it.
  const [viewing, setViewing] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | undefined>();
  const view = (species: string) => {
    if (species !== viewing) setPreview(undefined);
    setViewing(species);
  };

  const pool = schedule.pool.species;
  const index = (species: string) => team.findIndex((s) => s.species === species);
  const full = team.length === size;
  /** A form of a species already on the team (Species Clause allows one Rotom). */
  const clashOf = (species: string) =>
    index(species) < 0 ? team.find((s) => sameSpecies(s.species, species))?.species : undefined;
  const checks = useMemo(() => checklist(team.map((s) => findSet(s)!).filter(Boolean)), [team]);

  // The undo offer lasts a few seconds, and any manual edit makes it stale.
  useEffect(() => {
    if (!snack) return;
    // A rule explanation stays long enough to read in full.
    const id = setTimeout(() => setSnack(null), snack.undo ? 5000 : 8000);
    return () => clearTimeout(id);
  }, [snack]);

  const toggle = (species: string) => {
    setSnack(null);
    const clash = clashOf(species);
    if (team.some((s) => s.species === species)) {
      setTeam(team.filter((s) => s.species !== species));
    } else if (clash) {
      setSnack({ message: `One per team: ${clash} is a form of the same Pokémon` });
    } else if (full) {
      setShake((n) => n + 1);
    } else {
      // Prompt for the set, with the most used one ready to confirm.
      setPicker({ species, adding: true });
    }
  };

  /** One Mega per team (Gen 6): blocks a second Mega set with a short message. */
  const megaBlocked = (species: string, setId: string) => {
    const other = megaClash(team, { species, setId });
    if (other) setSnack({ message: `${ONE_MEGA_MESSAGE} ${other} has the Mega Stone.` });
    return !!other;
  };

  const add = (species: string, setId: string) => {
    if (megaBlocked(species, setId)) return;
    setPopped(species);
    setTeam((t) => [...t, { species, setId }]);
  };

  // Wide: a click adds with the previewed (or most used) set; the panel can change it.
  const toggleWide = (species: string) => {
    view(species);
    if (index(species) >= 0 || full || clashOf(species)) return toggle(species);
    setSnack(null);
    add(species, (species === viewing && preview) || topSet(species).id);
  };

  // The week's recommended team (DESIGN.md §9.2), if the pipeline found one.
  const recommended = schedule.suggestedTeams[0]?.team;
  const applyRecommended = () => {
    if (!recommended) return;
    setSnack({ message: 'Recommended team added', undo: team });
    setTeam(recommended.map((slot) => ({ ...slot })));
  };
  // Any Pokémon, any sets; tap again for another. Undo goes back to before the first roll.
  const applyRandom = () => {
    setSnack({ message: 'Random team', undo: snack?.reroll ? snack.undo : team, reroll: true });
    setTeam(randomTeam(schedule.pool.species, size, team));
  };

  const setSetFor = (species: string, setId: string) => {
    if (megaBlocked(species, setId)) return;
    setTeam((t) => t.map((s) => (s.species === species ? { ...s, setId } : s)));
  };

  // The undo message takes the button's place, so it never covers controls.
  const recommendRow = (
    <div className="flex shrink-0 flex-col gap-1">
      <div className="flex items-baseline gap-2">
        <h2 className="display text-[12px] tracking-wider text-muted uppercase">
          Recommended team
        </h2>
        <span className="truncate text-[12px] text-muted">Strong and ready to battle</span>
      </div>
      {snack ? (
        <div
          role="status"
          // Tap to dismiss; a rule message wraps to two lines instead of being cut off.
          onClick={snack.undo ? undefined : () => setSnack(null)}
          className="flex h-10 items-center gap-2 rounded-chip bg-accent-soft px-4"
        >
          {snack.undo && <CheckIcon width={16} height={16} className="text-soft-ink" />}
          <span
            className={
              snack.undo
                ? 'min-w-0 flex-1 truncate text-[14px] font-semibold'
                : 'min-w-0 flex-1 text-[13px] leading-4 font-semibold'
            }
          >
            {snack.message}
          </span>
          {snack.reroll && (
            <button
              type="button"
              aria-label="Another random team"
              className="grid size-9 place-items-center text-soft-ink active:scale-[0.94]"
              onClick={applyRandom}
            >
              <DiceIcon width={20} height={20} />
            </button>
          )}
          {snack.undo && (
            <button
              type="button"
              className="h-9 px-2 text-[14px] font-bold text-soft-ink"
              onClick={() => {
                setTeam(snack.undo!);
                setSnack(null);
              }}
            >
              Undo
            </button>
          )}
        </div>
      ) : (
        <div className="flex h-10 gap-2">
          {recommended && (
            <button
              type="button"
              onClick={applyRecommended}
              aria-label="Use recommended team"
              className="chip flex h-10 min-w-0 flex-1 items-center gap-2 pr-3 pl-1 active:scale-[0.99]"
            >
              <span className="flex min-w-0 flex-1 items-center overflow-hidden">
                {recommended.map((slot) => (
                  <img
                    key={slot.species}
                    src={getSprite(slot.species, 'icon')}
                    alt=""
                    className="pixelated -mr-2 h-8 w-10 shrink-0 object-contain"
                  />
                ))}
              </span>
              <span className="shrink-0 text-[14px] font-semibold">Use team</span>
            </button>
          )}
          <button
            type="button"
            onClick={applyRandom}
            aria-label="Random team"
            title="Random team"
            className={clsx(
              'chip flex h-10 shrink-0 items-center justify-center gap-1.5 active:scale-[0.97]',
              recommended ? 'w-10' : 'px-4 text-[14px] font-semibold',
            )}
          >
            <DiceIcon width={20} height={20} />
            {!recommended && 'Random team'}
          </button>
        </div>
      )}
    </div>
  );

  const done = CHECK_ITEMS.filter((c) => checks[c.key]);
  const missing = CHECK_ITEMS.filter((c) => !checks[c.key]);
  const checklistRow = hints && (
    <button
      type="button"
      onClick={() => setChecklistOpen(true)}
      className="flex h-8 shrink-0 items-center gap-2 rounded-xl px-1 text-left text-[13px]"
      aria-label={`Team checklist, ${done.length} of 5 covered. Show details`}
    >
      <span
        className={clsx(
          'rounded-full px-2 py-0.5 text-[12px] font-bold tabular-nums',
          missing.length ? 'bg-surface-2 text-muted' : 'bg-good/15 text-good',
        )}
      >
        {done.length}/5
      </span>
      <span className="min-w-0 flex-1 truncate text-muted">
        {missing.length ? (
          <>
            Missing{' '}
            <span className="font-semibold text-ink">{missing.map((c) => c.label).join(', ')}</span>
          </>
        ) : (
          'Your team covers the basics'
        )}
      </span>
      <ChevronIcon width={16} height={16} className="shrink-0 text-muted" />
    </button>
  );

  const lockButton = (
    <Button className="h-12 w-full shrink-0" disabled={!full} onClick={() => setConfirmOpen(true)}>
      {full ? 'Lock in team' : `Pick ${size - team.length} more`}
    </Button>
  );

  const poolGrid = wide ? (
    <div className="grid grid-cols-3 content-start gap-2">
      {pool.map((species) => {
        const i = index(species);
        return (
          <PokemonRow
            key={species}
            species={species}
            selected={i >= 0}
            dimmed={(full && i < 0) || !!clashOf(species)}
            pop={popped === species}
            onTap={() => toggleWide(species)}
            onInfo={() => view(species)}
            label={
              i >= 0
                ? `Remove ${species} from team`
                : clashOf(species)
                  ? `${species}: one per team with ${clashOf(species)}`
                  : `Add ${species} to team`
            }
            role={topSet(species).label}
            active={viewing === species}
          />
        );
      })}
    </div>
  ) : (
    <div className="grid min-h-0 flex-1 grid-cols-4 grid-rows-3 gap-2">
      {pool.map((species) => {
        const i = index(species);
        return (
          <PokemonTile
            key={species}
            species={species}
            selected={i >= 0}
            dimmed={(full && i < 0) || !!clashOf(species)}
            pop={popped === species}
            onTap={() => toggle(species)}
            onInfo={i < 0 ? () => setInfoFor(species) : undefined}
            onEdit={i >= 0 ? () => setPickerFor(species) : undefined}
            editLabel={i >= 0 ? `${species}, ${findSet(team[i]!)?.label}. Change set` : undefined}
            label={
              i >= 0
                ? `Remove ${species} from team`
                : clashOf(species)
                  ? `${species}: one per team with ${clashOf(species)}`
                  : `Add ${species} to team`
            }
          />
        );
      })}
    </div>
  );

  const traySlots = Array.from({ length: size }, (_, i) => team[i]);

  return (
    <div className="game-ui flex h-full flex-col">
      {topBar}
      {wide ? (
        <main className="grid min-h-0 flex-1 grid-cols-[1fr_380px] grid-rows-[minmax(0,1fr)] items-start gap-6 px-6 pb-6 pt-4">
          <section className="flex min-h-0 flex-col gap-3 self-stretch overflow-y-auto">
            <SectionLabel>This week’s pool · pick 6</SectionLabel>
            {poolGrid}
            <DetailsPanel
              key={viewing}
              species={viewing}
              setId={
                viewing ? (team.find((s) => s.species === viewing)?.setId ?? preview) : undefined
              }
              onSelectSet={(id) =>
                viewing && index(viewing) >= 0 ? setSetFor(viewing, id) : setPreview(id)
              }
              inTeam={!!viewing && index(viewing) >= 0}
              full={full}
              onToggle={() => viewing && toggleWide(viewing)}
            />
          </section>
          <aside className="card flex min-h-0 flex-col gap-3 self-stretch overflow-y-auto p-4">
            {noticeBar}
            {recommendRow}
            <SectionLabel
              right={
                <span className="text-[13px] font-semibold text-muted">
                  {team.length}/{size}
                </span>
              }
            >
              Your team
            </SectionLabel>
            <ul className="flex flex-col gap-1.5">
              {traySlots.map((slot, i) => (
                <li key={i} className="h-14">
                  {slot ? (
                    <div
                      className={clsx(
                        'flex h-full w-full items-center gap-1 rounded-card bg-surface-2 pr-1.5 pl-3',
                        viewing === slot.species && 'ring-2 ring-accent',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => view(slot.species)}
                        className="flex h-full min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <img
                          src={getSprite(slot.species, 'icon')}
                          alt=""
                          className="pixelated h-8 w-10 object-contain"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-semibold">
                            {slot.species}
                          </span>
                          <span className="block truncate text-[13px] text-muted">
                            {findSet(slot)?.label}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => toggle(slot.species)}
                        aria-label={`Remove ${slot.species} from team`}
                        className="grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-line hover:text-text"
                      >
                        <CloseIcon width={16} height={16} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex h-full items-center rounded-card border-2 border-dashed border-line px-3 text-[13px] text-muted">
                      Empty slot
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {checklistRow}
            {lockButton}
          </aside>
        </main>
      ) : (
        <main className="flex min-h-0 flex-1 flex-col gap-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
          {noticeBar}
          {recommendRow}
          {poolGrid}
          {checklistRow}
          {/* No team row here: picked tiles are highlighted, and their pencil changes the set. */}
          <div key={shake} className={clsx('shrink-0', shake > 0 && 'animate-shake')}>
            {lockButton}
          </div>
        </main>
      )}

      <InfoSheet
        species={infoFor}
        open={!!infoFor}
        onOpenChange={(o) => !o && setInfoFor(null)}
        action={
          infoFor
            ? index(infoFor) >= 0
              ? { label: 'Remove from team', onClick: () => (toggle(infoFor), setInfoFor(null)) }
              : {
                  label: clashOf(infoFor)
                    ? `One per team: ${clashOf(infoFor)} is in`
                    : full
                      ? 'Team is full'
                      : 'Add to team',
                  disabled: full || !!clashOf(infoFor),
                  onClick: () => (toggle(infoFor), setInfoFor(null)),
                }
            : undefined
        }
      />
      <SetPicker
        key={picker ? `${picker.species}-${picker.adding}` : ''}
        species={picker?.species ?? null}
        open={!!picker}
        onOpenChange={(o) => !o && setPicker(null)}
        currentSetId={
          picker && !picker.adding
            ? team.find((s) => s.species === picker.species)?.setId
            : undefined
        }
        chooseLabel={picker?.adding ? `Add ${picker.species}` : 'Use this set'}
        // One Mega per team: a second Mega Stone set can't be chosen.
        blocked={(setId) => {
          if (!picker) return undefined;
          const other = megaClash(team, { species: picker.species, setId });
          return other && `${ONE_MEGA_MESSAGE} ${other} has the Mega Stone.`;
        }}
        onChoose={(setId) => {
          if (!picker) return;
          if (picker.adding) add(picker.species, setId);
          else setSetFor(picker.species, setId);
          setPicker(null);
        }}
        onRemove={
          picker && !picker.adding
            ? () => {
                toggle(picker.species);
                setPicker(null);
              }
            : undefined
        }
      />
      <TeamCheckSheet
        open={checklistOpen}
        onOpenChange={setChecklistOpen}
        // A Mega set's type matchups are its Mega's: that's the form it battles in.
        team={team.map((s) => megaFor(s.species, findSet(s))?.forme ?? s.species)}
        sets={team.map((s) => findSet(s)).filter((s) => !!s)}
        checks={checks}
      />
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Lock in this team?"
        body={lockBody}
        confirm="Lock in"
        cancel="Keep editing"
        onConfirm={() => {
          setConfirmOpen(false);
          onLock(team);
        }}
      >
        <div className="grid grid-cols-6 gap-1">
          {team.map((s) => (
            <img
              key={s.species}
              src={getSprite(s.species)}
              alt={s.species}
              className="pixelated aspect-square w-full object-contain"
            />
          ))}
        </div>
      </ConfirmDialog>
    </div>
  );
}
