// Before a round's battle (DESIGN.md §18): you see who you face and their six
// species, make your one change (another Pokémon from the pool, or another
// set), pick your lead, and say you're ready. Your change stays hidden from
// the foe until the battle starts, and it stays on your team after.
import { formatInfo } from '@daily-battle/data/formats';
import { withChange, type Change, type RoomView } from '@daily-battle/versus';
import { useState, type ReactNode } from 'react';
import { findSet, megaClash, ONE_MEGA_MESSAGE, sameSpecies, setActiveFormat } from '../lib/data';
import { SetPicker } from '../sheets/SetPicker';
import { Button, SectionLabel } from '../ui/bits';
import { StarIcon } from '../ui/icons';
import { PokemonTile } from '../ui/PokemonTile';
import { Sheet } from '../ui/Sheet';
import { IconStrip } from './bits';
import { Countdown } from './Countdown';
import { Page } from './Page';
import type { LocalMatch } from './useRoom';

export function PrepScreen({
  match,
  room,
  onChange,
  onLead,
  onReady,
  onBack,
  right,
}: {
  match: LocalMatch;
  room: RoomView;
  onChange: (change: Change | null) => void;
  onLead: (species: string) => void;
  onReady: () => void;
  onBack: () => void;
  /** The room drawer. */
  right?: ReactNode;
}) {
  // Tiles and set cards read the room's game, which may not be the daily game.
  setActiveFormat(match.format);
  const foe = match.opponent.ai ? 'Rival (AI)' : match.opponent.name;
  const team = withChange(match.slots, match.change);
  const lead = match.lead ?? team[0]!.species;
  // The slot being changed, then the Pokémon being picked for it (its set next).
  const [editing, setEditing] = useState<number | null>(null);
  const [picking, setPicking] = useState<{ slot: number; species: string } | null>(null);
  const pool = room.pool?.species ?? [];
  const bench = (slot: number) =>
    pool.filter(
      (s) =>
        !team.some((t, i) => i !== slot && sameSpecies(t.species, s)) && s !== team[slot]?.species,
    );
  const ready = match.ready;
  const status = ready
    ? match.foeReady
      ? 'Starting…'
      : `Ready. Waiting for ${foe}`
    : match.change
      ? 'Change made. Pick your lead, then ready up'
      : 'Make one change if you like, pick your lead, and ready up';

  return (
    <Page title={`Round ${room.round} · vs ${foe}`} back="Room" onBack={onBack} right={right}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[15px] font-semibold" role="status">
          {status}
        </p>
        <Countdown ms={match.timeLeftMs} at={match.receivedAt} label="Time to get ready" />
      </div>

      <section className="space-y-2">
        <SectionLabel>{foe}’s team</SectionLabel>
        <IconStrip species={match.foeSpecies} label={`${foe}’s team`} />
        <p className="text-[12px] text-muted">
          {match.opponent.ai
            ? 'The AI keeps its team as it is.'
            : `${room.round > 1 ? 'As it stood after last round' : 'As built'}. ${foe} may make a change too.`}
        </p>
      </section>

      <section className="space-y-2">
        <SectionLabel>Your team</SectionLabel>
        <div className="grid grid-cols-2 gap-2 wide:grid-cols-3">
          {team.map((slot, i) => {
            const set = findSet(slot);
            const isLead = lead === slot.species;
            const changed = match.change?.slot === i;
            return (
              <PokemonTile
                key={slot.species}
                species={slot.species}
                selected={isLead}
                label={isLead ? `${slot.species}, leading` : `Lead with ${slot.species}`}
                onTap={ready ? undefined : () => onLead(slot.species)}
                onEdit={ready || (match.change && !changed) ? undefined : () => setEditing(i)}
                editLabel={`Change ${slot.species}`}
                badge={
                  (isLead || changed) && (
                    <span className="flex gap-1">
                      {isLead && (
                        <span className="flex items-center gap-0.5 rounded-badge bg-gold px-1.5 py-0.5 text-[11px] font-bold text-on-gold">
                          <StarIcon width={11} height={11} /> Lead
                        </span>
                      )}
                      {changed && (
                        <span className="rounded-badge bg-accent px-1.5 py-0.5 text-[11px] font-bold text-on-accent">
                          New
                        </span>
                      )}
                    </span>
                  )
                }
                footer={
                  set && (
                    <p className="px-2 pb-2 text-[11px] leading-snug text-muted">
                      {set.label}
                      <br />
                      {set.moves.join(', ')}
                    </p>
                  )
                }
              />
            );
          })}
        </div>
        {match.change && !ready && (
          <Button variant="ghost" className="w-full" onClick={() => onChange(null)}>
            Undo your change
          </Button>
        )}
      </section>

      <section className="space-y-2 pb-2">
        <Button className="w-full" disabled={ready} onClick={onReady}>
          {ready ? 'Ready' : `Ready with ${lead} leading`}
        </Button>
        <p className="text-center text-[12px] text-muted">
          {formatInfo(match.format).name} OU. If time runs out, you go in as you are.
        </p>
      </section>

      <Sheet
        open={editing !== null && !picking}
        onOpenChange={(open) => !open && setEditing(null)}
        title={editing !== null ? `Change ${team[editing]!.species}` : 'Change'}
        description="One change per round: another set, or another Pokémon from the pool."
        scroll
      >
        {editing !== null && (
          <div className="space-y-3 pb-2">
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => setPicking({ slot: editing, species: team[editing]!.species })}
            >
              Another set for {team[editing]!.species}
            </Button>
            <SectionLabel>Or swap in</SectionLabel>
            <div className="grid grid-cols-3 gap-2">
              {bench(editing).map((species) => (
                <PokemonTile
                  key={species}
                  species={species}
                  label={`Swap in ${species}`}
                  onTap={() => setPicking({ slot: editing, species })}
                />
              ))}
            </div>
          </div>
        )}
      </Sheet>
      <SetPicker
        species={picking?.species ?? null}
        open={!!picking}
        onOpenChange={(open) => !open && setPicking(null)}
        currentSetId={
          picking && team[picking.slot]?.species === picking.species
            ? team[picking.slot]!.setId
            : undefined
        }
        // One Mega per team (Gen 6): a second Mega Stone can't come in.
        blocked={(setId) => {
          if (!picking) return undefined;
          const others = team.filter((_, i) => i !== picking.slot);
          const other = megaClash(others, { species: picking.species, setId });
          return other && `${ONE_MEGA_MESSAGE} ${other} has the Mega Stone.`;
        }}
        chooseLabel={
          picking && team[picking.slot]?.species === picking.species ? 'Use this set' : 'Swap in'
        }
        onChoose={(setId) => {
          if (!picking) return;
          const original = match.slots[picking.slot]!;
          const to = { species: picking.species, setId };
          // Back to what it was is no change at all.
          onChange(
            to.species === original.species && to.setId === original.setId
              ? null
              : { slot: picking.slot, to },
          );
          setPicking(null);
          setEditing(null);
        }}
      />
    </Page>
  );
}
