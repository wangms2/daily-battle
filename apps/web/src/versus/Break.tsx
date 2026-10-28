// Between rounds and at the end of a game (DESIGN.md §18). The break is a
// short sequence everyone sees together, timed by the room: the round's
// results (a lost life cracks), the standings, then who you face next, with a
// quick shuffle of names before it lands. A tap skips ahead on your own
// screen. The end of a game crowns the winner on a podium.
import { INTERMISSION_MS, type RoomView } from '@daily-battle/versus';
import clsx from 'clsx';
import { useState } from 'react';
import { useNow } from '../state/context';
import { Button, SectionLabel } from '../ui/bits';
import { Hearts, IconStrip, Standings } from './bits';
import { Countdown } from './Countdown';
import { LeaveButton, type Common } from './GameScreens';
import { Page } from './Page';
import { nameIn, placeText, standings } from './standings';

/** When each part of the break begins, in ms from its start. */
const STANDINGS_AT = 2800;
const NEXT_AT = 5000;
/** How long the names shuffle before your opponent lands. */
const SHUFFLE_MS = 900;

/** Hearts with the one just lost cracking. */
function LostHeart({ lives, max }: { lives: number; max: number }) {
  return (
    <span
      role="img"
      aria-label={`Lost a life: ${lives} left`}
      className="inline-flex gap-0.5 text-[16px] leading-none"
    >
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          aria-hidden
          className={clsx(
            i < lives ? 'text-bad' : i === lives ? 'anim-heart-crack text-bad' : 'text-line',
          )}
          style={i === lives ? { animationDelay: '500ms' } : undefined}
        >
          ♥
        </span>
      ))}
    </span>
  );
}

function Results({ room, you }: { room: RoomView; you: string }) {
  const last = room.lastRound;
  if (!last) return null;
  const player = (id: string) => room.players.find((p) => p.id === id);
  const me = player(you);
  const outNow = me && last.out.includes(you);
  return (
    <section className="space-y-2" aria-label="Results">
      {outNow && me.place !== null && (
        <div className="anim-vs-stamp card border-bad p-4 text-center" role="status">
          <p className="home-serif text-[22px]">You’re out</p>
          <p className="text-[14px] text-muted">
            {placeText(me.place)} · {me.wins}–{me.losses}. Stay to watch the rest.
          </p>
        </div>
      )}
      <ul className="space-y-2">
        {last.matches.map((m, i) => {
          const ai = m.players.p2 === 'ai';
          const name = (side: 'p1' | 'p2') => (side === 'p2' && ai ? 'Rival (AI)' : m.names[side]);
          const losers = (['p1', 'p2'] as const).filter(
            (side) => m.winner !== side && !(ai && side === 'p2'),
          );
          return (
            <li
              key={i}
              className="anim-slide-in card flex items-center gap-3 px-4 py-3"
              style={{ animationDelay: `${i * 160}ms` }}
            >
              <span className="min-w-0 flex-1 text-[15px]">
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
                {losers.map((side) => {
                  const p = player(m.players[side]);
                  return (
                    p &&
                    last.out.includes(p.id) && (
                      <span
                        key={side}
                        className="anim-vs-stamp ml-2 inline-block rounded-badge bg-bad px-1.5 text-[11px] font-bold text-white"
                        style={{ animationDelay: `${900 + i * 160}ms` }}
                      >
                        {p.name} out
                      </span>
                    )
                  );
                })}
              </span>
              <span className="flex flex-col items-end gap-1">
                {losers.map((side) => {
                  const p = player(m.players[side]);
                  return p ? (
                    <LostHeart key={side} lives={p.lives} max={room.settings.lives} />
                  ) : null;
                })}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Who you face next, after a quick shuffle through everyone still in. */
function NextUp({ room, you, sinceNext }: { room: RoomView; you: string; sinceNext: number }) {
  const mine = room.next.find((p) => p.p1 === you || p.p2 === you);
  const me = room.players.find((p) => p.id === you);
  if (!mine || !me) {
    return (
      <section className="space-y-2" aria-label="Next round">
        <SectionLabel>Round {room.round + 1}</SectionLabel>
        <ul className="card divide-y divide-line">
          {room.next.map((p, i) => (
            <li
              key={i}
              className="anim-slide-in px-4 py-3 text-[15px] font-semibold"
              style={{ animationDelay: `${i * 140}ms` }}
            >
              {nameIn(room, p.p1)} <span className="text-muted">vs</span> {nameIn(room, p.p2)}
            </li>
          ))}
        </ul>
      </section>
    );
  }
  const foeId = mine.p1 === you ? mine.p2 : mine.p1;
  const others = room.players.filter((p) => p.id !== you && p.place === null).map((p) => p.name);
  const shuffling = sinceNext < SHUFFLE_MS && others.length > 1;
  const shown = shuffling
    ? others[Math.floor(sinceNext / 90) % others.length]!
    : nameIn(room, foeId);
  const foe = room.players.find((p) => p.id === foeId);
  return (
    <section
      className="card overflow-hidden px-4 py-6 text-center"
      aria-label="Next round"
      aria-live="polite"
    >
      <p className="text-[13px] font-semibold tracking-wider text-muted uppercase">
        Round {room.round + 1}
      </p>
      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="anim-vs-left">
          <p className="home-serif truncate text-[20px]">You</p>
          <Hearts lives={me.lives} max={room.settings.lives} />
        </div>
        <p
          className="anim-vs-stamp home-serif text-[28px] text-accent"
          style={{ animationDelay: '300ms' }}
        >
          VS
        </p>
        <div className="anim-vs-right">
          <p
            className={clsx('home-serif truncate text-[20px]', shuffling && 'opacity-60')}
            role="status"
          >
            {shuffling ? shown : `${shown}`}
          </p>
          {!shuffling && foe && <Hearts lives={foe.lives} max={room.settings.lives} />}
          {!shuffling && !foe && <p className="text-[12px] text-muted">The AI</p>}
        </div>
      </div>
      {!shuffling && foe && room.settings.pool === 'random' && (
        <div className="anim-slide-in mt-4 space-y-1">
          <p className="text-[12px] text-muted">{foe.name}’s 12</p>
          <IconStrip species={foe.pool} label={`${foe.name}’s 12`} className="justify-center" />
        </div>
      )}
    </section>
  );
}

/** The break between rounds: results, standings, and who you face next. */
export function BreakScreen({ room, you, at, onLeave, onBack, right }: Common) {
  const now = useNow(90).getTime();
  // The room's clock: how far into the break we are, the same on every screen.
  const elapsed =
    room.timeLeftMs === null ? INTERMISSION_MS : INTERMISSION_MS - (room.timeLeftMs - (now - at));
  const [skipTo, setSkipTo] = useState(0);
  const t = Math.max(elapsed, skipTo);
  const part = t >= NEXT_AT ? 'next' : t >= STANDINGS_AT ? 'standings' : 'results';
  const me = room.players.find((p) => p.id === you);
  const skip = () => setSkipTo(part === 'results' ? STANDINGS_AT : NEXT_AT + SHUFFLE_MS);
  return (
    <Page
      title={`Round ${room.lastRound?.round ?? room.round} results`}
      back="Back"
      onBack={onBack}
      right={right}
    >
      {/* A tap anywhere moves your screen on to the next part. */}
      <div onClick={part === 'next' ? undefined : skip} className="space-y-4">
        <div className="flex items-center justify-between gap-3 text-[13px] text-muted">
          <span>
            Round {room.round + 1} in{' '}
            <Countdown ms={room.timeLeftMs} at={at} label="Next round in" />
          </span>
          {part !== 'next' && (
            <button type="button" className="font-semibold text-accent" onClick={skip}>
              Skip
            </button>
          )}
        </div>
        {part === 'results' && <Results room={room} you={you} />}
        {part === 'standings' && (
          <section className="anim-slide-in space-y-2">
            <SectionLabel>Standings</SectionLabel>
            <Standings room={room} you={you} />
          </section>
        )}
        {part === 'next' && (
          <NextUp room={room} you={you} sinceNext={t - Math.max(NEXT_AT, skipTo - SHUFFLE_MS)} />
        )}
      </div>
      {part === 'next' && (
        <section className="space-y-2">
          <SectionLabel>Standings</SectionLabel>
          <Standings room={room} you={you} />
        </section>
      )}
      <LeaveButton onLeave={onLeave} inGame={!!me && me.place === null} />
    </Page>
  );
}

const CONFETTI = ['var(--gold)', 'var(--accent)', 'var(--bad)', 'var(--good)'];

/** The end of a game: the winner on a podium, the final standings, and another game. */
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
  // The podium: second, first, third, by final placement.
  const top = standings(room.players).slice(0, 3);
  const podium = [top[1], top[0], top[2]];
  const heights = ['h-16', 'h-24', 'h-12'];
  return (
    <Page title="Game over" back="Back" onBack={onBack}>
      <section className="card relative overflow-hidden p-5 text-center">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          {Array.from({ length: 24 }, (_, i) => (
            <span
              key={i}
              className="confetti-piece"
              style={{
                // Spread out, so no two neighbours share a colour and a start.
                left: `${(i * 61.8) % 100}%`,
                background: CONFETTI[i % CONFETTI.length],
                animationDelay: `${(i * 137) % 1100}ms`,
              }}
            />
          ))}
        </div>
        <p className="home-serif relative text-[24px]" role="status">
          {headline}
        </p>
        <p className="relative mt-1 text-[14px] text-muted">After {room.round} rounds.</p>
        <div
          className="relative mt-5 grid grid-cols-3 items-end gap-2"
          role="group"
          aria-label="Podium"
        >
          {podium.map((p, i) =>
            p ? (
              <div
                key={p.id}
                className="anim-slide-in"
                style={{ animationDelay: `${300 + i * 200}ms` }}
              >
                <p className="truncate text-[14px] font-semibold">{p.name}</p>
                <div
                  className={clsx(
                    'mt-1 grid place-items-center rounded-t-card text-[18px] font-bold',
                    heights[i],
                    i === 1 ? 'bg-gold text-on-gold' : 'bg-surface-2',
                  )}
                >
                  {p.place}
                </div>
              </div>
            ) : (
              <div key={i} />
            ),
          )}
        </div>
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
