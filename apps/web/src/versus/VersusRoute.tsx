// Versus rooms with friends (DESIGN.md §18): `#versus` creates or joins a
// room, `#versus/CODE` is the room itself.
import { cleanName, ERROR_TEXT, normalizeCode, type ErrorCode } from '@daily-battle/versus';
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { startVersusMusic, stopVersusMusic } from '../lib/audio';
import type { Settings } from '../state/schema';
import { Button } from '../ui/bits';
import { BreakScreen, GameOverScreen } from './Break';
import { BuildScreen, RoundScreen } from './GameScreens';
import { Lobby } from './Lobby';
import { Friends } from '../ui/Friends';
import { Page } from './Page';
import { HowToLink, VersusHowTo } from './HowTo';
import { PrepScreen } from './PrepScreen';
import { RoomDrawer } from './RoomDrawer';
import { savedName, saveName } from './saved';
import { createRoom, useRoom, type EndReason } from './useRoom';

// The battle screen brings the simulator's data, so it loads when a battle starts.
const LiveBattle = lazy(() => import('./LiveBattle'));
const SpectateScreen = lazy(() => import('./watch/SpectateScreen'));

/** What the battle screen needs from the app: your battle settings. */
export interface BattleSettings {
  settings: Settings;
  onSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  onExplainerSeen: (id: string) => void;
}

/**
 * The versus track, while shown: on Link Battle's menus (its home, a room's lobby,
 * between rounds), never over building, the swap or a battle, which have their own
 * music. Moving between menus plays it on (DESIGN.md §21).
 */
function VersusMusic() {
  useEffect(() => {
    startVersusMusic();
    return stopVersusMusic;
  }, []);
  return null;
}

/** The explainer id for the How Link Battle works sheet (settings.shownExplainers). */
export const HOW_TO_SEEN = 'versus-howto';

/** The room code in a `versus/CODE` route, or null for the versus home. */
const roomCodeOf = (route: string): string | null =>
  route.startsWith('versus/') ? normalizeCode(route.slice('versus/'.length)) : null;

export function VersusRoute({
  route,
  go,
  onExit,
  battle,
}: {
  route: string;
  go: (route: string) => void;
  /** Back to the daily game. */
  onExit: () => void;
  battle: BattleSettings;
}) {
  const code = roomCodeOf(route);
  // The name to join a room with straight away (you just created it, or typed a name first).
  const [joinAs, setJoinAs] = useState<{ code: string; name: string } | null>(null);
  // How it works: on the first visit (Link Battle or a room's link), then on request.
  const [howTo, setHowTo] = useState(() => !battle.settings.shownExplainers.includes(HOW_TO_SEEN));
  const sheet = (
    <VersusHowTo
      open={howTo}
      onDone={() => {
        setHowTo(false);
        battle.onExplainerSeen(HOW_TO_SEEN);
      }}
    />
  );
  if (!code) {
    return (
      <>
        <VersusMusic />
        <VersusHome
          onExit={onExit}
          onHowTo={() => setHowTo(true)}
          onRoom={(c, name) => {
            setJoinAs(name ? { code: c, name } : null);
            go(`versus/${c}`);
          }}
        />
        {sheet}
      </>
    );
  }
  return (
    <>
      <RoomScreen
        key={code}
        code={code}
        autoJoinAs={joinAs?.code === code ? joinAs.name : undefined}
        battle={battle}
        onHowTo={() => setHowTo(true)}
        onExit={() => go('versus')}
      />
      {sheet}
    </>
  );
}

const inputClass = 'field h-11 w-full px-3 text-[16px] placeholder:text-muted';

function NameField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-[14px] font-medium">Your name</span>
      <input
        className={inputClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="nickname"
        maxLength={32}
        placeholder="What friends will see"
        aria-invalid={!!error || undefined}
      />
      {error && <span className="block text-[13px] text-bad">{error}</span>}
    </label>
  );
}

function VersusHome({
  onExit,
  onRoom,
  onHowTo,
}: {
  onExit: () => void;
  onRoom: (code: string, name: string | null) => void;
  onHowTo: () => void;
}) {
  const [name, setName] = useState(savedName);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clean = cleanName(name);
  const typed = normalizeCode(code);

  const create = async () => {
    if (!clean) return;
    setBusy(true);
    setError(null);
    try {
      const room = await createRoom();
      saveName(clean);
      onRoom(room, clean);
    } catch {
      setError('Couldn’t create a room. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title="Link Battle" back="Back" onBack={onExit} hero>
      <Friends size="sm" className="pt-1" />
      <p className="text-[14px] leading-relaxed text-muted">
        Live battles with friends. Everyone builds from the same 12, makes one change before each
        round, and plays until one player has lives left. <HowToLink onClick={onHowTo} />
      </p>
      {/* Create and Join side by side on wide screens. */}
      <div className="space-y-4 wide:grid wide:grid-cols-2 wide:items-start wide:gap-4 wide:space-y-0">
        <section className="card space-y-3 p-4">
          <NameField value={name} onChange={setName} />
          <Button className="w-full" disabled={!clean || busy} onClick={create}>
            {busy ? 'Creating…' : 'Create a room'}
          </Button>
          {error && (
            <p role="alert" className="text-[13px] text-bad">
              {error}
            </p>
          )}
        </section>
        <section className="card space-y-3 p-4">
          <label className="block space-y-1.5">
            <span className="block text-[14px] font-medium">Join with a code</span>
            <input
              className={`${inputClass} font-semibold tracking-[0.2em] uppercase`}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && typed) onRoom(typed, clean);
              }}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              maxLength={8}
              placeholder="5 letters"
            />
          </label>
          <Button
            variant="secondary"
            className="w-full"
            disabled={!typed}
            onClick={() => typed && onRoom(typed, clean)}
          >
            Join room
          </Button>
        </section>
      </div>
    </Page>
  );
}

const END_TEXT: Record<EndReason, string> = {
  noRoom: ERROR_TEXT.noRoom,
  full: ERROR_TEXT.full,
  started: ERROR_TEXT.started,
  kicked: 'The host removed you from the room.',
  replaced: 'This room is open in another tab.',
  left: 'You left the room.',
};

function RoomScreen({
  code,
  autoJoinAs,
  onExit,
  onHowTo,
  battle,
}: {
  code: string;
  autoJoinAs?: string;
  onExit: () => void;
  onHowTo: () => void;
  battle: BattleSettings;
}) {
  const room = useRoom(code, autoJoinAs);
  const { status, match } = room;
  const [name, setName] = useState(savedName);
  const clean = cleanName(name);
  // The room's lobby, opened from your battle (it carries on meanwhile).
  const [inRoomFor, setInRoomFor] = useState<string | null>(null);

  if (status.kind === 'joined') {
    const { room: view, you, at } = status;
    const leave = () => {
      room.leave();
      onExit();
    };
    // Watching battles in progress is for spectators and players already out.
    const watcher =
      view.spectators.some((s) => s.id === you) ||
      view.players.some((p) => p.id === you && p.place !== null);
    const drawer = <RoomDrawer room={view} you={you} />;
    const common = { room: view, you, at, onLeave: leave, onBack: onExit, right: drawer };
    // Your battle: the swap before it, the battle itself (a finished one only
    // if you saw it here, until you go back to the room).
    const watchable =
      !!match &&
      (match.stage === 'battle' || (match.stage === 'over' && room.feedFor(match.id).size > 0));
    let screen: ReactNode;
    // Whether the screen is one of the room's menus, with the versus track.
    let menu = true;
    if (match && inRoomFor !== match.id && (match.stage === 'prep' || watchable)) {
      menu = false;
      const toRoom = () => {
        if (match.stage === 'over') room.dismissMatch();
        else setInRoomFor(match.id);
      };
      screen =
        match.stage === 'prep' ? (
          <PrepScreen
            match={match}
            room={view}
            onChange={room.change}
            onLead={room.lead}
            onReady={room.ready}
            onBack={toRoom}
            right={drawer}
          />
        ) : (
          <Suspense fallback={<p className="py-10 text-center text-muted">Loading the battle…</p>}>
            <LiveBattle
              key={match.id}
              match={match}
              feed={room.feedFor(match.id)}
              choose={room.choose}
              forfeit={room.forfeit}
              {...battle}
              onBack={toRoom}
              right={drawer}
              reactions={room.reactions}
            />
          </Suspense>
        );
    } else if (view.phase === 'playing' && watcher) {
      menu = false;
      screen = (
        <Suspense fallback={<p className="py-10 text-center text-muted">Loading the battles…</p>}>
          <SpectateScreen
            room={view}
            you={you}
            watchFeedFor={room.watchFeedFor}
            reactions={room.reactions}
            onReact={room.react}
            onBack={onExit}
          />
        </Suspense>
      );
    } else if (view.phase === 'build' && !view.players.some((p) => p.id === you)) {
      screen = <RoundScreen {...common} note="The players are building their teams." />;
    } else if (view.phase === 'build') {
      // Building has its game's builder track; waiting for the others after, the versus one.
      menu = !!room.team;
      screen = (
        <BuildScreen
          {...common}
          team={room.team}
          hints={battle.settings.beginnerHints}
          onSubmit={room.submitTeam}
        />
      );
    } else if (view.phase === 'playing') {
      screen = (
        <RoundScreen
          {...common}
          onToBattle={match && match.stage !== 'over' ? () => setInRoomFor(null) : undefined}
        />
      );
    } else if (view.phase === 'intermission') {
      screen = <BreakScreen {...common} />;
    } else if (view.phase === 'over') {
      screen = <GameOverScreen {...common} onPlayAgain={room.playAgain} />;
    } else {
      screen = (
        <Lobby
          room={view}
          you={you}
          command={room.command}
          onStart={room.start}
          onRedraw={room.redraw}
          onLeave={leave}
          onBack={onExit}
          onHowTo={onHowTo}
        />
      );
    }
    return (
      <>
        {menu && <VersusMusic />}
        {screen}
        <RoomNotice connected={status.connected} notice={room.notice} />
      </>
    );
  }

  let body: ReactNode;
  if (status.kind === 'connecting') {
    body = <p className="py-10 text-center text-muted">Connecting…</p>;
  } else if (status.kind === 'name') {
    const error = status.error && ERROR_TEXT[status.error as ErrorCode];
    body = (
      <form
        className="card space-y-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (clean) room.join(clean);
        }}
      >
        <NameField value={name} onChange={setName} error={error} />
        <Button type="submit" className="w-full" disabled={!clean}>
          Join room
        </Button>
      </form>
    );
  } else {
    body = (
      <section className="card space-y-3 p-4 text-center">
        <p className="text-[15px]">{END_TEXT[status.reason]}</p>
        {status.reason === 'replaced' && (
          <Button className="w-full" onClick={room.reconnect}>
            Use this tab instead
          </Button>
        )}
        <Button variant="secondary" className="w-full" onClick={onExit}>
          Back to Versus
        </Button>
      </section>
    );
  }
  return (
    <Page title={`Room ${code}`} back="Back" onBack={onExit}>
      <VersusMusic />
      {body}
    </Page>
  );
}

/** Reconnecting, or a passing problem ("Only the host can do that."), over any room screen. */
function RoomNotice({ connected, notice }: { connected: boolean; notice: string | null }) {
  const text = !connected ? 'Reconnecting…' : notice;
  if (!text) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 flex justify-center px-4">
      <p
        role={connected ? 'alert' : 'status'}
        className="rounded-full bg-ink px-4 py-2 text-[13px] font-semibold text-surface shadow-card"
      >
        {text}
      </p>
    </div>
  );
}
