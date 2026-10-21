// Daily brief (DESIGN.md §4.3): today's opponent (species only), your team,
// the lead, and today's single change, all on one screen.
import type { ScheduleFile } from '@daily-battle/gen/schedule';
import clsx from 'clsx';
import { useEffect, useState, type ReactNode } from 'react';
import { findSet, type Slot } from '../lib/data';
import { getSprite, preloadSprites } from '../lib/sprites';
import { InfoSheet } from '../sheets/InfoSheet';
import { ConfirmDialog } from '../sheets/misc';
import { SetPicker } from '../sheets/SetPicker';
import type { DayChange, DayState } from '../state/schema';
import { Button, SectionLabel } from '../ui/bits';
import { StarIcon } from '../ui/icons';
import { PokemonTile } from '../ui/PokemonTile';
import { useWide } from '../ui/useWide';

type Mode =
  | { kind: 'view' }
  | { kind: 'edit' }
  /** Choosing who comes in for team slot `slot`. */
  | { kind: 'replace'; slot: number };

export function DailyBrief({
  schedule,
  day,
  team,
  dayState,
  hints,
  onLead,
  onChange,
  onStart,
  renderTopBar,
}: {
  schedule: ScheduleFile;
  day: string;
  team: Slot[];
  dayState: DayState;
  hints: boolean;
  onLead: (species: string) => void;
  onChange: (change: DayChange) => void;
  onStart: () => void;
  renderTopBar: (left?: ReactNode) => ReactNode;
}) {
  const wide = useWide();
  const opponent = schedule.days.find((d) => d.day === day)!;
  const lead =
    dayState.lead && team.some((s) => s.species === dayState.lead)
      ? dayState.lead
      : team[0]!.species;
  const [mode, setMode] = useState<Mode>({ kind: 'view' });
  const [infoFor, setInfoFor] = useState<{ species: string; foe: boolean } | null>(null);
  const [setView, setSetView] = useState<Slot | null>(null);
  const [picker, setPicker] = useState<{
    slot: number;
    species: string;
    kind: DayChange['kind'];
  } | null>(null);
  const [pending, setPending] = useState<DayChange | null>(null);

  useEffect(() => preloadSprites(opponent.team.map((s) => s.species)), [opponent]);

  const editing = mode.kind !== 'view';
  const bench = schedule.pool.species.filter((s) => !team.some((t) => t.species === s));

  const describe = (c: DayChange) =>
    c.kind === 'replace'
      ? `${c.from.species} → ${c.to.species} (${findSet(c.to)?.label})`
      : `${c.from.species}: ${findSet(c.from)?.label} → ${findSet(c.to)?.label}`;

  const changeChip = dayState.swapUsed ? (
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
      {editing ? 'Done' : '1 change left'}
    </button>
  );

  const opponentSection =
    mode.kind === 'replace' ? (
      <section className="flex min-h-0 flex-1 flex-col gap-2">
        <SectionLabel>Who comes in for {team[mode.slot]!.species}?</SectionLabel>
        <div className="grid min-h-0 flex-1 grid-cols-3 grid-rows-2 gap-2">
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
      <section className="flex min-h-0 flex-1 flex-col gap-2">
        <SectionLabel>Opponent</SectionLabel>
        <div className="grid min-h-0 flex-1 grid-cols-3 grid-rows-2 gap-2">
          {opponent.team.map(({ species }) => (
            <PokemonTile
              key={species}
              species={species}
              label={`About ${species}`}
              onTap={() => setInfoFor({ species, foe: true })}
            />
          ))}
        </div>
      </section>
    );

  const teamSection = (
    <section className="flex min-h-0 flex-1 flex-col gap-2">
      <SectionLabel right={changeChip}>
        {editing ? 'Pick a Pokémon to change' : 'Your team'}
      </SectionLabel>
      <div className="grid min-h-0 flex-1 grid-cols-3 grid-rows-2 gap-2">
        {team.map((slot, i) => {
          const isLead = slot.species === lead;
          return (
            <PokemonTile
              key={slot.species}
              species={slot.species}
              showTypes={!editing}
              selected={!editing && isLead}
              badge={
                !editing && isLead ? (
                  <span className="flex items-center gap-0.5 rounded-badge bg-gold px-1.5 py-0.5 text-[11px] font-bold text-on-gold">
                    <StarIcon width={11} height={11} /> Lead
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

  const start = (
    <Button className="h-12 w-full shrink-0" onClick={onStart} disabled={editing}>
      Start · {lead} leads
    </Button>
  );

  const vs = (
    <div
      className={clsx(
        'flex shrink-0 items-center gap-3 text-[12px] font-bold tracking-[0.2em] text-muted',
        wide && 'flex-col',
      )}
    >
      <span className={clsx('bg-line', wide ? 'w-px flex-1' : 'h-px flex-1')} />
      VS
      <span className={clsx('bg-line', wide ? 'w-px flex-1' : 'h-px flex-1')} />
    </div>
  );

  const topBar = renderTopBar(
    editing ? (
      <span className="flex items-center gap-2">
        <button
          type="button"
          className="font-semibold text-accent"
          onClick={() => setMode({ kind: 'view' })}
        >
          Cancel
        </button>
        <span className="text-muted">·</span>
        <span>Today’s change</span>
      </span>
    ) : undefined,
  );

  return (
    <div className="flex h-full flex-col">
      {topBar}
      {wide ? (
        <main className="flex min-h-0 flex-1 flex-col gap-4 px-6 pb-6">
          <div className="grid min-h-0 flex-1 grid-cols-[1fr_auto_1fr] gap-6">
            {opponentSection}
            {vs}
            {teamSection}
          </div>
          <div className="mx-auto w-full max-w-md">{start}</div>
        </main>
      ) : (
        <main className="flex min-h-0 flex-1 flex-col gap-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {opponentSection}
          {vs}
          {teamSection}
          {hints && !editing && (
            <p className="shrink-0 text-center text-[13px] text-muted">
              Tap a Pokémon to lead · ⓘ shows its set
            </p>
          )}
          {start}
        </main>
      )}

      <InfoSheet
        species={infoFor?.species ?? null}
        open={!!infoFor}
        onOpenChange={(o) => !o && setInfoFor(null)}
        showRoles={!infoFor?.foe}
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
        title="Use today’s change?"
        body={pending ? `${describe(pending)}. This sticks for the rest of the week.` : ''}
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
    </div>
  );
}
