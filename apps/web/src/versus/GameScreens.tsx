// The game's screens around the battles (DESIGN.md §18): building a team from
// the pool, a round in progress for anyone not battling, the break between
// rounds, and the end of the game.
import type { RoomView, Slot } from '@daily-battle/versus';
import type { ScheduleFile } from '@daily-battle/gen/schedule';
import clsx from 'clsx';
import { useState } from 'react';
import { setActiveFormat } from '../lib/data';
import { TeamBuilder } from '../screens/TeamBuilder';
import { ConfirmDialog } from '../sheets/misc';
import { Button, SectionLabel } from '../ui/bits';
import { IconStrip, Standings } from './bits';
import { Countdown } from './Countdown';
import { Page } from './Page';
import { nameIn, placeText } from './standings';

interface Common {
  room: RoomView;
  you: string;
  /** When the room was last heard from (its timer counts from then). */
  at: number;
  onLeave: () => void;
  onBack: () => void;
}

/** Leaving mid-game: you're out, and you can't come back to this game. */
function LeaveButton({ onLeave, inGame }: { onLeave: () => void; inGame: boolean }) {
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
    <Page title="Your team" back="Room" onBack={onBack}>
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
}: Common & { onToBattle?: () => void }) {
  const me = room.players.find((p) => p.id === you);
  return (
    <Page title={`Round ${room.round}`} back="Versus" onBack={onBack}>
      {me?.place != null && (
        <p className="card p-4 text-center text-[15px]" role="status">
          You’re out: <span className="font-semibold">{placeText(me.place)}</span>. Watching battles
          arrives in the next update.
        </p>
      )}
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
      <section className="space-y-2">
        <SectionLabel>Standings</SectionLabel>
        <Standings room={room} you={you} />
      </section>
      <LeaveButton onLeave={onLeave} inGame={me?.place == null} />
    </Page>
  );
}

/** The break between rounds: how the round went, the standings, and who you face next. */
export function IntermissionScreen({ room, you, at, onLeave, onBack }: Common) {
  const me = room.players.find((p) => p.id === you)!;
  const last = room.lastRound;
  const mine = room.next.find((p) => p.p1 === you || p.p2 === you);
  const foe = mine && nameIn(room, mine.p1 === you ? mine.p2 : mine.p1);
  return (
    <Page title={`Round ${last?.round ?? room.round} results`} back="Versus" onBack={onBack}>
      <section className="card space-y-1 p-4 text-center" aria-label="Next round">
        <p className="text-[13px] text-muted">
          Round {room.round + 1} starts in{' '}
          <Countdown ms={room.timeLeftMs} at={at} label="Next round in" />
        </p>
        <p className="display text-[22px]" role="status">
          {me.place != null ? `You’re out: ${placeText(me.place)}` : foe ? `You vs ${foe}` : ''}
        </p>
      </section>
      {last && (
        <section className="space-y-2">
          <SectionLabel>Results</SectionLabel>
          <ul className="card divide-y divide-line" aria-label="Results">
            {last.matches.map((m, i) => {
              const ai = m.players.p2 === 'ai';
              const name = (side: 'p1' | 'p2') =>
                side === 'p2' && ai ? 'Rival (AI)' : m.names[side];
              return (
                <li key={i} className="px-4 py-2 text-[15px]">
                  {m.winner ? (
                    <>
                      <span className="font-semibold">{name(m.winner)}</span> beat{' '}
                      {name(m.winner === 'p1' ? 'p2' : 'p1')}
                    </>
                  ) : (
                    `${name('p1')} and ${name('p2')} drew`
                  )}
                  {m.reason === 'timeout' && <span className="text-muted"> · out of time</span>}
                  {m.reason === 'forfeit' && <span className="text-muted"> · gave up</span>}
                </li>
              );
            })}
          </ul>
          {last.out.length > 0 && (
            <p className="text-[14px]">
              Out this round:{' '}
              <span className="font-semibold">
                {last.out.map((id) => nameIn(room, id)).join(', ')}
              </span>
            </p>
          )}
        </section>
      )}
      <section className="space-y-2">
        <SectionLabel>Standings</SectionLabel>
        <Standings room={room} you={you} />
      </section>
      <LeaveButton onLeave={onLeave} inGame={me.place == null} />
    </Page>
  );
}

/** The end of a game: the winner, the final standings, and another game. */
export function GameOverScreen({
  room,
  you,
  onPlayAgain,
  onLeave,
  onBack,
}: Common & { onPlayAgain: () => void }) {
  const winners = room.players.filter((p) => p.place === 1);
  const youWon = winners.some((p) => p.id === you);
  const headline =
    winners.length > 1
      ? `${winners.map((p) => p.name).join(' and ')} share the win`
      : youWon
        ? 'You win!'
        : `${winners[0]?.name ?? 'Nobody'} wins`;
  return (
    <Page title="Game over" back="Versus" onBack={onBack}>
      <section className="card p-5 text-center">
        <p className="display text-[24px]" role="status">
          {headline}
        </p>
        <p className="mt-1 text-[14px] text-muted">After {room.round} rounds.</p>
      </section>
      <section className="space-y-2">
        <SectionLabel>Final standings</SectionLabel>
        <Standings room={room} you={you} />
      </section>
      <section className="space-y-2 pb-2">
        {room.hostId === you ? (
          <Button className="w-full" onClick={onPlayAgain}>
            Play again
          </Button>
        ) : (
          <p className="text-center text-[13px] text-muted">
            Waiting for the host to start another game.
          </p>
        )}
        <LeaveButton onLeave={onLeave} inGame={false} />
      </section>
    </Page>
  );
}
