// Weekly team builder (DESIGN.md §12.2a). Phone: one screen, no scrolling:
// suggestions, the 4×3 pool, the checklist, the tray, and Lock in.
// Wide: the pool on the left, the team panel on the right.
import type { ScheduleFile } from '@daily-battle/gen/schedule';
import clsx from 'clsx';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CHECK_ITEMS, checklist, findSet, topSet, type Slot } from '../lib/data';
import { getSprite } from '../lib/sprites';
import { ConfirmDialog, TeamCheckSheet } from '../sheets/misc';
import { InfoSheet } from '../sheets/InfoSheet';
import { SetPicker } from '../sheets/SetPicker';
import { Button, SectionLabel } from '../ui/bits';
import { CheckIcon, ChevronIcon, PencilIcon } from '../ui/icons';
import { PokemonTile, SlotBadge } from '../ui/PokemonTile';
import { useWide } from '../ui/useWide';

/** Archetype dots: Dialga blue, Giratina crimson, Palkia mauve. */
const ARCHETYPE_DOT: Record<string, string> = {
  Balanced: 'var(--accent)',
  Offense: 'var(--bad)',
  Stall: 'var(--accent-soft-text)',
};

export function TeamBuilder({
  schedule,
  hints,
  onLock,
  topBar,
}: {
  schedule: ScheduleFile;
  hints: boolean;
  onLock: (team: Slot[]) => void;
  topBar: ReactNode;
}) {
  const wide = useWide();
  const [team, setTeam] = useState<Slot[]>([]);
  const [popped, setPopped] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const [infoFor, setInfoFor] = useState<string | null>(null);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [snack, setSnack] = useState<{ message: string; undo: Slot[] } | null>(null);

  const pool = schedule.pool.species;
  const index = (species: string) => team.findIndex((s) => s.species === species);
  const full = team.length === 6;
  const checks = useMemo(() => checklist(team.map((s) => findSet(s)!).filter(Boolean)), [team]);

  // The undo offer lasts a few seconds, and any manual edit makes it stale.
  useEffect(() => {
    if (!snack) return;
    const id = setTimeout(() => setSnack(null), 5000);
    return () => clearTimeout(id);
  }, [snack]);

  const toggle = (species: string) => {
    setSnack(null);
    if (team.some((s) => s.species === species)) {
      setTeam(team.filter((s) => s.species !== species));
    } else if (full) {
      setShake((n) => n + 1);
    } else {
      setPopped(species);
      setTeam([...team, { species, setId: topSet(species).id }]);
    }
  };

  const applySuggested = (i: number) => {
    const s = schedule.suggestedTeams[i]!;
    setSnack({ message: `Applied ${s.archetype}`, undo: team });
    setTeam(s.team.map((slot) => ({ ...slot })));
  };

  const setSetFor = (species: string, setId: string) =>
    setTeam((t) => t.map((s) => (s.species === species ? { ...s, setId } : s)));

  // The undo message takes the suggestions row's place, so it never covers controls.
  const suggestions =
    schedule.suggestedTeams.length > 0 &&
    (snack ? (
      <div
        role="status"
        className="flex h-10 shrink-0 items-center gap-2 rounded-chip bg-accent-soft px-4"
      >
        <CheckIcon width={16} height={16} className="text-soft-ink" />
        <span className="flex-1 text-[14px] font-semibold">{snack.message}</span>
        <button
          type="button"
          className="h-9 px-2 text-[14px] font-bold text-soft-ink"
          onClick={() => {
            setTeam(snack.undo);
            setSnack(null);
          }}
        >
          Undo
        </button>
      </div>
    ) : (
      <div className="flex h-10 shrink-0 items-center gap-2 overflow-hidden">
        <span className="text-[13px] font-medium text-muted wide:sr-only">Suggested</span>
        {schedule.suggestedTeams.map((s, i) => (
          <button
            key={s.archetype}
            type="button"
            onClick={() => applySuggested(i)}
            className="chip flex h-9 items-center gap-1.5 px-3 text-[14px] font-semibold active:scale-[0.97]"
          >
            <span
              className="size-2 rounded-full"
              style={{ background: ARCHETYPE_DOT[s.archetype] }}
              aria-hidden
            />
            {s.archetype}
          </button>
        ))}
      </div>
    ));

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
      {full ? 'Lock in team' : `Pick ${6 - team.length} more`}
    </Button>
  );

  const poolGrid = (
    <div
      className={clsx(
        'grid min-h-0 flex-1 gap-2',
        wide ? 'grid-cols-6 grid-rows-2' : 'grid-cols-4 grid-rows-3',
      )}
    >
      {pool.map((species) => {
        const i = index(species);
        return (
          <PokemonTile
            key={species}
            species={species}
            selected={i >= 0}
            dimmed={full && i < 0}
            pop={popped === species}
            badge={i >= 0 ? <SlotBadge n={i + 1} /> : undefined}
            onTap={() => toggle(species)}
            onInfo={() => setInfoFor(species)}
            label={i >= 0 ? `Remove ${species} from team` : `Add ${species} to team`}
            footer={
              wide ? (
                <span className="truncate px-2 pb-2 text-center text-[12px] text-muted">
                  {topSet(species).label}
                </span>
              ) : undefined
            }
          />
        );
      })}
    </div>
  );

  const traySlots = Array.from({ length: 6 }, (_, i) => team[i]);

  return (
    <div className="flex h-full flex-col">
      {topBar}
      {wide ? (
        <main className="grid min-h-0 flex-1 grid-cols-[1fr_380px] gap-6 px-6 pb-6">
          <section className="flex min-h-0 flex-col gap-3">
            <SectionLabel>This week’s pool · pick 6</SectionLabel>
            {poolGrid}
          </section>
          <aside className="card flex min-h-0 flex-col gap-3 p-4">
            {suggestions}
            <SectionLabel
              right={<span className="text-[13px] font-semibold text-muted">{team.length}/6</span>}
            >
              Your team
            </SectionLabel>
            <ul className="flex min-h-0 flex-1 flex-col gap-1.5">
              {traySlots.map((slot, i) => (
                <li key={i} className="min-h-0 flex-1">
                  {slot ? (
                    <button
                      type="button"
                      onClick={() => setPickerFor(slot.species)}
                      className="flex h-full w-full items-center gap-3 rounded-card bg-surface-2 px-3 text-left"
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
                      <span className="text-[13px] font-semibold text-accent">Change</span>
                    </button>
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
        <main className="flex min-h-0 flex-1 flex-col gap-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {suggestions}
          {poolGrid}
          {checklistRow}
          <div
            key={shake}
            className={clsx('grid h-16 shrink-0 grid-cols-6 gap-1.5', shake > 0 && 'animate-shake')}
            role="group"
            aria-label={`Your team, ${team.length} of 6`}
          >
            {traySlots.map((slot, i) =>
              slot ? (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPickerFor(slot.species)}
                  aria-label={`${slot.species}, ${findSet(slot)?.label}. Change set`}
                  className="card relative grid place-items-center"
                >
                  <img
                    src={getSprite(slot.species, 'icon')}
                    alt=""
                    className="pixelated h-9 w-12 object-contain"
                  />
                  <span className="absolute right-0.5 bottom-0.5 grid size-4 place-items-center rounded-full bg-accent text-on-accent">
                    <PencilIcon width={9} height={9} />
                  </span>
                </button>
              ) : (
                <div
                  key={i}
                  className="rounded-card border-2 border-dashed border-line"
                  aria-hidden
                />
              ),
            )}
          </div>
          {lockButton}
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
                  label: full ? 'Team is full' : 'Add to team',
                  disabled: full,
                  onClick: () => (toggle(infoFor), setInfoFor(null)),
                }
            : undefined
        }
      />
      <SetPicker
        key={pickerFor ?? ''}
        species={pickerFor}
        open={!!pickerFor}
        onOpenChange={(o) => !o && setPickerFor(null)}
        currentSetId={team.find((s) => s.species === pickerFor)?.setId}
        onChoose={(setId) => {
          setSetFor(pickerFor!, setId);
          setPickerFor(null);
        }}
        onRemove={() => {
          toggle(pickerFor!);
          setPickerFor(null);
        }}
      />
      <TeamCheckSheet
        open={checklistOpen}
        onOpenChange={setChecklistOpen}
        team={team.map((s) => s.species)}
        checks={checks}
      />
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Lock in this team?"
        body="It’s yours for the week. You get 1 change per day."
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
