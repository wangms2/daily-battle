// The room at a glance during a game, like Super Auto Pets' versus rooms:
// everyone's hearts, who's battling whom, and each team as Poké Balls (never
// species; fainted ones greyed). Players still in can't watch other battles;
// anyone who can (out of the game, or a spectator) opens one from here.
import type { RoomView, Side } from '@daily-battle/versus';
import clsx from 'clsx';
import { useState } from 'react';
import { Sheet } from '../ui/Sheet';
import { SectionLabel } from '../ui/bits';
import { Hearts } from './bits';
import { nameIn, placeText, standings } from './standings';

type RoomMatch = RoomView['matches'][number];

/** A team as balls: `size` of them, the last `fainted` greyed. */
export function Balls({ size, fainted, label }: { size: number; fainted: number; label: string }) {
  return (
    <span
      role="img"
      aria-label={`${label}: ${size - fainted} of ${size} left`}
      className="inline-flex gap-0.5"
    >
      {Array.from({ length: size }, (_, i) => (
        <img
          key={i}
          src="/fx/pokeball.png"
          alt=""
          aria-hidden
          className={clsx('size-3.5', i >= size - fainted && 'opacity-30 grayscale')}
        />
      ))}
    </span>
  );
}

const stageText = (room: RoomView, m: RoomMatch) =>
  m.stage === 'prep'
    ? 'Getting ready'
    : m.stage === 'battle'
      ? m.sizes.p1 - m.fainted.p1 === 1 || m.sizes.p2 - m.fainted.p2 === 1
        ? 'Last Pokémon!'
        : 'Battling'
      : m.winner
        ? `${nameIn(room, m.players[m.winner])} won`
        : 'Draw';

function BattleRow({
  room,
  match,
  onWatch,
}: {
  room: RoomView;
  match: RoomMatch;
  onWatch?: (id: string) => void;
}) {
  const side = (s: Side) => (
    <span className="flex min-w-0 items-center justify-between gap-2">
      <span className="truncate text-[14px] font-semibold">{nameIn(room, match.players[s])}</span>
      <Balls
        size={match.sizes[s]}
        fainted={match.fainted[s]}
        label={`${nameIn(room, match.players[s])}’s team`}
      />
    </span>
  );
  const body = (
    <>
      <span className="grid min-w-0 flex-1 gap-1">
        {side('p1')}
        {side('p2')}
      </span>
      <span className="w-24 shrink-0 text-right text-[12px] text-muted">
        {stageText(room, match)}
      </span>
    </>
  );
  return onWatch && match.stage !== 'prep' ? (
    <button
      type="button"
      onClick={() => onWatch(match.id)}
      className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-surface-2"
      aria-label={`Watch ${nameIn(room, match.players.p1)} vs ${nameIn(room, match.players.p2)}`}
    >
      {body}
    </button>
  ) : (
    <div className="flex items-center gap-3 px-4 py-2">{body}</div>
  );
}

export function RoomDrawer({
  room,
  you,
  onWatch,
}: {
  room: RoomView;
  you: string;
  /** For those who may watch: open a battle. */
  onWatch?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const me = room.players.find((p) => p.id === you);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 items-center gap-1.5 rounded-chip border border-line bg-surface px-2.5 text-[13px] font-semibold"
        aria-haspopup="dialog"
      >
        {me && me.place === null ? (
          <Hearts lives={me.lives} max={room.settings.lives} />
        ) : (
          <span aria-hidden>👀</span>
        )}
        Room
      </button>
      <Sheet open={open} onOpenChange={setOpen} title={`Room ${room.code}`} scroll>
        <div className="space-y-4 pb-2">
          {room.matches.length > 0 && (
            <section className="space-y-2">
              <SectionLabel>Round {room.round}</SectionLabel>
              <div className="card divide-y divide-line" role="list" aria-label="Battles">
                {room.matches.map((m) => (
                  <div role="listitem" key={m.id}>
                    <BattleRow
                      room={room}
                      match={m}
                      onWatch={
                        onWatch &&
                        ((id) => {
                          setOpen(false);
                          onWatch(id);
                        })
                      }
                    />
                  </div>
                ))}
              </div>
              {!onWatch && (
                <p className="text-[12px] text-muted">
                  Players still in can’t watch other battles, as in a tournament.
                </p>
              )}
            </section>
          )}
          <section className="space-y-2">
            <SectionLabel>Players</SectionLabel>
            <ul className="card divide-y divide-line" aria-label="Room players">
              {standings(room.players).map((p) => (
                <li key={p.id} className="flex min-h-11 items-center gap-3 px-4 py-2">
                  <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">
                    {p.name}
                    {p.id === you && <span className="font-normal text-muted"> (you)</span>}
                    {p.place !== null && (
                      <span className="font-normal text-muted"> · {placeText(p.place)}</span>
                    )}
                  </span>
                  <Hearts lives={p.lives} max={room.settings.lives} />
                </li>
              ))}
            </ul>
          </section>
          {room.spectators.length > 0 && (
            <p className="text-[13px] text-muted">
              Watching: {room.spectators.map((s) => s.name).join(', ')}
            </p>
          )}
        </div>
      </Sheet>
    </>
  );
}
