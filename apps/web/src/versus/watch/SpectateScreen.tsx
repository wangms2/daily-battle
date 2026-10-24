// Watching a round's battles (DESIGN.md §18): for players who are out, and
// for spectators who joined late. On a big screen every battle shows at once
// (at most four), and one can be brought up large; on a phone two stack, with
// chips to switch between them. Loaded on demand: it brings the presenter.
import type { Reaction, RoomView } from '@daily-battle/versus';
import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { Field } from '../../battle/ui/Field';
import { BattleText } from '../../battle/ui/text';
import { startMusic, stopMusic } from '../../lib/audio';
import { setActiveFormat } from '../../lib/data';
import { backgroundFor } from '../../lib/fx';
import { useWide } from '../../ui/useWide';
import { Hearts } from '../bits';
import type { Feed } from '../feed';
import { Page } from '../Page';
import { FloatingReactions, ReactionBar } from '../Reactions';
import { Balls, RoomDrawer } from '../RoomDrawer';
import { nameIn, placeText } from '../standings';
import type { ReactionEvent, WatchMessage } from '../useRoom';
import { useWatched } from './useWatched';

type RoomMatch = RoomView['matches'][number];

/** How close a battle is: the fewest Pokémon either side has left (closer battles first). */
const closeness = (m: RoomMatch) => Math.min(m.sizes.p1 - m.fainted.p1, m.sizes.p2 - m.fainted.p2);

function SideLine({ room, match, side }: { room: RoomView; match: RoomMatch; side: 'p1' | 'p2' }) {
  const id = match.players[side];
  const player = room.players.find((p) => p.id === id);
  return (
    <div className="flex items-center gap-2 px-3 py-1.5">
      <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{nameIn(room, id)}</span>
      {player && <Hearts lives={player.lives} max={room.settings.lives} />}
      <Balls
        size={match.sizes[side]}
        fainted={match.fainted[side]}
        label={`${nameIn(room, id)}’s team`}
      />
    </div>
  );
}

function WatchCard({
  room,
  match,
  feed,
  reactions,
  onReact,
  large,
  compact = false,
  onFocus,
}: {
  room: RoomView;
  match: RoomMatch;
  feed: Feed<WatchMessage>;
  reactions: Feed<ReactionEvent>;
  onReact: (emoji: Reaction) => void;
  large: boolean;
  /** On a phone: the latest line and the reactions share a row, so two battles fit. */
  compact?: boolean;
  onFocus?: () => void;
}) {
  const format = room.settings.format;
  const watched = useWatched(feed, format);
  const title = `${nameIn(room, match.players.p1)} vs ${nameIn(room, match.players.p2)}`;
  const last = match.sizes.p1 - match.fainted.p1 === 1 || match.sizes.p2 - match.fainted.p2 === 1;
  const lines = watched.log.slice(large ? -10 : compact ? -1 : -2);
  return (
    <section className="card overflow-hidden" aria-label={title}>
      <SideLine room={room} match={match} side="p2" />
      <div className="relative">
        {match.stage === 'prep' ? (
          <div className="grid aspect-[440/295] place-items-center bg-surface-2 text-[14px] text-muted">
            Getting ready…
          </div>
        ) : (
          <Field
            className="aspect-[440/295] w-full"
            view={watched.view}
            anim={watched.anim}
            animate={large}
            background={backgroundFor(match.id, format)}
            floats={watched.floats}
            onFloatDone={watched.floatDone}
            onTap={() => onFocus?.()}
            info={null}
            onInfo={() => {}}
            popover={null}
          />
        )}
        {last && match.stage === 'battle' && (
          <span className="absolute top-2 left-1/2 z-10 -translate-x-1/2 rounded-full bg-gold px-2 py-0.5 text-[12px] font-bold text-on-gold">
            Last Pokémon!
          </span>
        )}
        {match.stage === 'over' && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-black/35">
            <p className="display rounded-card bg-surface px-4 py-2 text-[17px]">
              {match.winner ? `${nameIn(room, match.players[match.winner])} won` : 'Draw'}
            </p>
          </div>
        )}
        <FloatingReactions feed={reactions} match={match.id} />
      </div>
      <SideLine room={room} match={match} side="p1" />
      <div className={clsx(compact && 'flex items-center border-t border-line')}>
        <div
          className={clsx(
            'px-3 text-[13px] leading-snug',
            compact ? 'min-w-0 flex-1 truncate py-1 [&>p]:truncate' : 'border-t border-line py-2',
            !compact && (large ? 'h-48 overflow-y-auto' : 'h-12 overflow-hidden'),
          )}
          role="log"
          aria-label={`${title} battle log`}
        >
          {lines.length ? (
            lines.map((l, i) => (
              <p key={watched.log.length - lines.length + i}>
                <BattleText text={l} />
              </p>
            ))
          ) : (
            <p className="text-muted">The battle is starting…</p>
          )}
        </div>
        {compact && (
          <div className="shrink-0 pr-1">
            <ReactionBar onReact={onReact} compact />
          </div>
        )}
      </div>
      {!compact && (
        <div className="flex items-center justify-between gap-2 border-t border-line px-2 py-1">
          <ReactionBar onReact={onReact} />
          {onFocus && (
            <button
              type="button"
              onClick={onFocus}
              className="h-9 rounded-chip px-2 text-[13px] font-semibold text-accent hover:bg-surface-2"
            >
              {large ? 'Show all' : 'Bigger'}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

export default function SpectateScreen({
  room,
  you,
  watchFeedFor,
  reactions,
  onReact,
  onBack,
}: {
  room: RoomView;
  you: string;
  watchFeedFor: (id: string) => Feed<WatchMessage>;
  reactions: Feed<ReactionEvent>;
  onReact: (match: string, emoji: Reaction) => void;
  onBack: () => void;
}) {
  setActiveFormat(room.settings.format);
  // The battle music while you watch (cries stay off: several battles at once would clash).
  const format = room.settings.format;
  useEffect(() => {
    startMusic(format);
    return () => stopMusic();
  }, [format]);
  const wide = useWide();
  const me = room.players.find((p) => p.id === you);
  const matches = room.matches;
  const [focus, setFocus] = useState<string | null>(null);
  // Phones: two at a time, the closest battles unless you've picked.
  const [picked, setPicked] = useState<string[]>([]);
  const byCloseness = [...matches].sort((a, b) => closeness(a) - closeness(b));
  const shown = (
    picked.filter((id) => matches.some((m) => m.id === id)).length
      ? picked.filter((id) => matches.some((m) => m.id === id))
      : byCloseness.map((m) => m.id)
  ).slice(0, 2);
  const pick = (id: string) =>
    setPicked((p) => (p.includes(id) ? p : [id, ...shown.filter((x) => x !== id)].slice(0, 2)));

  const card = (m: RoomMatch, large: boolean, onFocus?: () => void, compact = false) => (
    <WatchCard
      key={m.id}
      room={room}
      match={m}
      feed={watchFeedFor(m.id)}
      reactions={reactions}
      onReact={(emoji) => onReact(m.id, emoji)}
      large={large}
      compact={compact}
      onFocus={onFocus}
    />
  );
  const focused = matches.find((m) => m.id === focus);

  return (
    <Page
      title={`Round ${room.round}`}
      back="Versus"
      onBack={onBack}
      wide={wide}
      right={<RoomDrawer room={room} you={you} onWatch={wide ? setFocus : pick} />}
    >
      <p className="text-[14px] text-muted" role="status">
        {me?.place != null
          ? `You’re out (${placeText(me.place)}). Watching the rest.`
          : 'You’re watching. You’ll play in the next game.'}
      </p>
      {!matches.length && <p className="py-10 text-center text-muted">No battles right now.</p>}
      {wide ? (
        focused ? (
          <div className="grid grid-cols-[1fr_340px] items-start gap-4">
            {card(focused, true, () => setFocus(null))}
            <div className="space-y-4">
              {matches
                .filter((m) => m !== focused)
                .map((m) => card(m, false, () => setFocus(m.id)))}
            </div>
          </div>
        ) : (
          <div className={clsx('grid gap-4', matches.length > 1 && 'grid-cols-2')}>
            {matches.map((m) => card(m, matches.length === 1, () => setFocus(m.id)))}
          </div>
        )
      ) : (
        <>
          {matches.length > 2 && (
            <div
              className="flex gap-1.5 overflow-x-auto pb-1"
              role="group"
              aria-label="Battles to show"
            >
              {matches.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={shown.includes(m.id)}
                  onClick={() => pick(m.id)}
                  className={clsx(
                    'chip shrink-0 px-3 py-1.5 text-[13px]',
                    shown.includes(m.id) ? 'is-selected card font-semibold' : 'hover:bg-surface-2',
                  )}
                >
                  {nameIn(room, m.players.p1)} vs {nameIn(room, m.players.p2)}
                </button>
              ))}
            </div>
          )}
          <div className="space-y-3">
            {shown.map((id) =>
              card(
                matches.find((m) => m.id === id)!,
                false,
                undefined,
                true,
              ),
            )}
          </div>
        </>
      )}
    </Page>
  );
}
