// The game's screens around the battles (DESIGN.md §18): building a team from
// the pool, a round in progress for anyone not battling, the break between
// rounds, and the end of the game.
import type { RoomView, Slot } from '@daily-battle/versus';
import type { ScheduleFile } from '@daily-battle/gen/schedule';
import clsx from 'clsx';
import { useState, type ReactNode } from 'react';
import { setActiveFormat } from '../lib/data';
import { TeamBuilder } from '../screens/TeamBuilder';
import { ConfirmDialog } from '../sheets/misc';
import { Button, SectionLabel } from '../ui/bits';
import { IconStrip, Standings } from './bits';
import { Countdown } from './Countdown';
import { Page } from './Page';

export interface Common {
  room: RoomView;
  you: string;
  /** When the room was last heard from (its timer counts from then). */
  at: number;
  onLeave: () => void;
  onBack: () => void;
  /** The room drawer. */
  right?: ReactNode;
}

/** Leaving mid-game: you're out, and you can't come back to this game. */
export function LeaveButton({ onLeave, inGame }: { onLeave: () => void; inGame: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" className="w-full" onClick={() => setOpen(true)}>
        Leave room
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Leave the room?"
        body={
          inGame
            ? 'You’re out of this game, and any battle you’re in counts as a loss.'
            : 'You can join again with the code while the room is open.'
        }
        confirm="Leave"
        onConfirm={() => {
          setOpen(false);
          onLeave();
        }}
      />
    </>
  );
}

/** Builds your team from the room's 12, then waits for everyone else. */
export function BuildScreen({
  room,
  you,
  at,
  team,
  hints,
  onSubmit,
  onLeave,
  onBack,
  right,
}: Common & { team: Slot[] | null; hints: boolean; onSubmit: (team: Slot[]) => void }) {
  setActiveFormat(room.settings.format);
  const me = room.players.find((p) => p.id === you)!;
  const timer = <Countdown ms={room.timeLeftMs} at={at} label="Time to build" />;
  if (!team) {
    // The builder takes a schedule; a room's has its pool and no suggestions.
    const schedule: ScheduleFile = {
      version: 1,
      generatorVersion: 0,
      dataBuiltAt: '',
      week: '',
      pool: { species: room.pool!.species, candidate: 0 },
      suggestedTeams: [],
      days: [],
    };
    return (
      <TeamBuilder
        schedule={schedule}
        hints={hints}
        size={me.teamSize}
        lockBody="It’s your team for this game. Before each round you get one change."
        onLock={onSubmit}
        topBar={
          <header className="flex h-12 shrink-0 items-center justify-between gap-2 px-3 pt-[env(safe-area-inset-top)] wide:px-6">
            <h1 className="display text-[16px]">
              Build your team · {me.teamSize} of {room.pool!.species.length}
            </h1>
            {timer}
          </header>
        }
      />
    );
  }
  const built = room.players.filter((p) => p.built || p.left).length;
  return (
    <Page title="Your team" back="Room" onBack={onBack} right={right}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[15px] font-semibold" role="status">
          {built} of {room.players.length} ready
        </p>
        {timer}
      </div>
      <IconStrip species={team.map((s) => s.species)} label="Your team" />
      <ul className="card divide-y divide-line" aria-label="Players">
        {room.players.map((p) => (
          <li key={p.id} className="flex min-h-12 items-center justify-between px-4 py-2">
            <span className="text-[15px] font-semibold">{p.name}</span>
            <span className={clsx('text-[13px]', p.built ? 'text-good' : 'text-muted')}>
              {p.left ? 'Left' : p.built ? 'Ready' : 'Building…'}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-[13px] text-muted">
        Anyone still building when time runs out gets the pool’s most used Pokémon.
      </p>
      <LeaveButton onLeave={onLeave} inGame />
    </Page>
  );
}

/** A round in progress, for anyone not battling: out of the game, or finished early. */
export function RoundScreen({
  room,
  you,
  onToBattle,
  onLeave,
  onBack,
  right,
  note,
}: Common & { onToBattle?: () => void; note?: string }) {
  const me = room.players.find((p) => p.id === you);
  return (
    <Page
      title={room.phase === 'build' ? 'Building teams' : `Round ${room.round}`}
      back="Back"
      onBack={onBack}
      right={right}
    >
      <p className="card p-4 text-center text-[15px]" role="status">
        {note ??
          'Your battle’s over. The round ends when the others finish; open Room to see how they stand.'}
      </p>
      {room.matches.length > 0 && (
        <section className="space-y-2">
          <SectionLabel>Battles</SectionLabel>
          <ul className="card divide-y divide-line" aria-label="Battles">
            {room.matches.map((m) => (
              <li key={m.id} className="flex min-h-12 items-center justify-between gap-3 px-4 py-2">
                <span className="text-[15px] font-semibold">
                  {m.names.p1} vs {m.players.p2 === 'ai' ? 'Rival (AI)' : m.names.p2}
                </span>
                <span className="text-[13px] text-muted">
                  {m.stage === 'prep'
                    ? 'Getting ready'
                    : m.stage === 'battle'
                      ? 'Battling'
                      : m.winner
                        ? `${m.names[m.winner]} won`
                        : 'Draw'}
                </span>
              </li>
            ))}
          </ul>
          {onToBattle && (
            <Button className="w-full" onClick={onToBattle}>
              Back to your battle
            </Button>
          )}
        </section>
      )}
      <section className="space-y-2">
        <SectionLabel>Standings</SectionLabel>
        <Standings room={room} you={you} />
      </section>
      <LeaveButton onLeave={onLeave} inGame={!!me && me.place == null} />
    </Page>
  );
}
