// A connection to one versus room: joins (or rejoins with a saved token),
// keeps the latest room, and reconnects when the connection drops.
import {
  CLOSE,
  ERROR_TEXT,
  parseServerMessage,
  type ClientMessage,
  type Change,
  type ErrorCode,
  type MatchView,
  type Reaction,
  type Slot,
  type RoomCommand,
  type RoomView,
  type ServerMessage,
} from '@daily-battle/versus';
import { useCallback, useEffect, useRef, useState } from 'react';
import { playChime } from '../lib/audio';
import { Feed } from './feed';
import { forgetToken, saveName, saveToken, tokenFor } from './saved';

export type SideMessage = Extract<ServerMessage, { type: 'side' }>;
export type WatchMessage = Extract<ServerMessage, { type: 'watch' }>;
/** A reaction as it arrives, numbered so each floats up once. */
export type ReactionEvent = Extract<ServerMessage, { type: 'reaction' }> & { n: number };

/** Your battle as the room last described it, and when that was (its clock counts from then). */
export type LocalMatch = MatchView & { receivedAt: number };

/** Why you're no longer in a room. */
export type EndReason = 'noRoom' | 'full' | 'started' | 'kicked' | 'replaced' | 'left';

export type RoomStatus =
  | { kind: 'connecting' }
  /** Connected; pick a name to join (again, if the last one was taken). */
  | { kind: 'name'; error?: ErrorCode }
  /** `at`: when the room was last heard from (its timers count from then). */
  | { kind: 'joined'; you: string; room: RoomView; at: number; connected: boolean }
  | { kind: 'ended'; reason: EndReason };

const ENDS: Partial<Record<number, EndReason>> = {
  [CLOSE.noRoom]: 'noRoom',
  [CLOSE.kicked]: 'kicked',
  [CLOSE.replaced]: 'replaced',
  [CLOSE.left]: 'left',
};

/** A connection that's heard nothing for this long may have died silently (a phone asleep). */
export const STALE_MS = 45_000;
/** A connection still opening after this long is given up and tried again. */
const OPENING_MS = 15_000;
/** How often the connection is checked. */
const CHECK_MS = 20_000;

/** Whether a game starts afresh at this phase: its battles (and their ids) are new. */
const isNewGame = (phase: RoomView['phase'], last: RoomView['phase'] | null) =>
  (phase === 'lobby' || phase === 'build') && phase !== last;

const socketUrl = (code: string) =>
  `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/api/rooms/${code}/socket`;

/** Opens a new room and returns its code. */
export async function createRoom(): Promise<string> {
  const res = await fetch('/api/rooms', { method: 'POST' });
  if (!res.ok) throw new Error(`Couldn’t create a room (${res.status})`);
  return ((await res.json()) as { code: string }).code;
}

export function useRoom(code: string, autoJoinAs?: string) {
  const [status, setStatus] = useState<RoomStatus>({ kind: 'connecting' });
  /** A passing problem to show, like "Only the host can do that." */
  const [notice, setNotice] = useState<string | null>(null);
  const socket = useRef<WebSocket | null>(null);
  /** The name to join with once connected. */
  const joinAs = useRef(autoJoinAs);
  const [session, setSession] = useState(0);
  /** Your battle this round; kept after it ends, until a new round replaces it. */
  const [match, setMatch] = useState<LocalMatch | null>(null);
  /** The last match stage seen, to chime once when a battle starts. */
  const lastStage = useRef<{ id: string; stage: string } | null>(null);
  const [watchTick, setWatchTick] = useState(0);
  /** Your team in this game, as the room has it. */
  const [team, setTeam] = useState<Slot[] | null>(null);
  /** Each battle's lines, by match id. */
  const feeds = useRef(new Map<string, Feed<SideMessage>>());
  const feedFor = useCallback((id: string) => {
    let feed = feeds.current.get(id);
    if (!feed) feeds.current.set(id, (feed = new Feed()));
    return feed;
  }, []);
  /** Each battle's public log, by match id, for watching (out of the game, or a spectator). */
  const watchFeeds = useRef(new Map<string, Feed<WatchMessage>>());
  const watchFeedFor = useCallback((id: string) => {
    let feed = watchFeeds.current.get(id);
    if (!feed) watchFeeds.current.set(id, (feed = new Feed()));
    return feed;
  }, []);
  /** Spectators' reactions, to the battles you play or watch. */
  const [reactions] = useState(() => new Feed<ReactionEvent>());
  /** Counts games in this room, so screens can drop what they kept from the last one. */
  const [game, setGame] = useState(0);
  /** The room's phase as last heard, to tell when a new game starts. */
  const lastPhase = useRef<RoomView['phase'] | null>(null);
  /** Giving up while disconnected: sent once you're back. */
  const forfeitLater = useRef(false);

  const send = useCallback((msg: ClientMessage) => {
    if (socket.current?.readyState !== WebSocket.OPEN) return false;
    socket.current.send(JSON.stringify(msg));
    return true;
  }, []);

  useEffect(() => {
    let disposed = false;
    let retry: number | undefined;
    let failures = 0;
    let reactionCount = 0;
    /** A rejoin was refused (you were removed meanwhile): reconnect and join afresh. */
    let rejoinRefused = false;
    /** When the socket last opened or heard from the room. */
    let heardAt = Date.now();
    /** The room's done with you (kicked, left, another tab): no more reconnecting. */
    let stopped = false;

    /** A new game: battles from the last one (whose ids may repeat) are gone. */
    const phaseIs = (phase: RoomView['phase']) => {
      if (isNewGame(phase, lastPhase.current)) {
        feeds.current.clear();
        watchFeeds.current.clear();
        lastStage.current = null;
        forfeitLater.current = false;
        setMatch(null);
        setGame((n) => n + 1);
      }
      lastPhase.current = phase;
    };

    const connect = () => {
      retry = undefined;
      const ws = new WebSocket(socketUrl(code));
      socket.current = ws;
      heardAt = Date.now();
      const sendHere = (msg: ClientMessage) => ws.send(JSON.stringify(msg));
      let joined = false;
      ws.onopen = () => {
        heardAt = Date.now();
        failures = 0;
        const token = tokenFor(code);
        if (token) sendHere({ type: 'rejoin', token });
        else if (joinAs.current) sendHere({ type: 'join', name: joinAs.current });
        else setStatus({ kind: 'name' });
      };
      ws.onmessage = (e) => {
        heardAt = Date.now();
        const msg = parseServerMessage(e.data);
        if (!msg) return;
        if (msg.type === 'welcome') {
          joined = true;
          saveToken(code, msg.token);
          joinAs.current = undefined;
          phaseIs(msg.room.phase);
          // Back after a drop: a battle the room no longer has in play is stale (the
          // room sends the current one next). A finished one stays up to be seen.
          const live = new Set(
            msg.room.phase === 'playing'
              ? msg.room.matches.filter((m) => m.stage !== 'over').map((m) => m.id)
              : [],
          );
          setMatch((m) => (m && m.stage !== 'over' && !live.has(m.id) ? null : m));
          if (forfeitLater.current) {
            forfeitLater.current = false;
            sendHere({ type: 'forfeit' });
          }
          setStatus({
            kind: 'joined',
            you: msg.you,
            room: msg.room,
            at: Date.now(),
            connected: true,
          });
        } else if (msg.type === 'room') {
          const at = Date.now();
          phaseIs(msg.room.phase);
          setStatus((s) =>
            s.kind === 'joined' ? { ...s, room: msg.room, at, connected: true } : s,
          );
        } else if (msg.type === 'team') {
          setTeam(msg.team);
        } else if (msg.type === 'match') {
          const next = msg.match && { ...msg.match, receivedAt: Date.now() };
          // A chime when your battle starts (its prep ends).
          if (next?.stage === 'battle' && lastStage.current?.id === next.id) {
            if (lastStage.current.stage === 'prep') playChime();
          }
          lastStage.current = next && { id: next.id, stage: next.stage };
          // A finished battle stays up until you go back to the room.
          setMatch((m) => (next || !m || m.stage !== 'over' ? next : m));
        } else if (msg.type === 'side') {
          feedFor(msg.match).push(msg);
          // Your move, while you're on another tab.
          const request = msg.update.request as { requestType?: string } | null;
          if (!msg.resync && document.hidden && request && request.requestType !== 'wait') {
            playChime();
          }
        } else if (msg.type === 'watch') {
          // A resync starts the battle over (a reconnect): drop what came before.
          if (msg.resync) watchFeeds.current.delete(msg.match);
          watchFeedFor(msg.match).push(msg);
          setWatchTick((n) => n + 1);
        } else if (msg.type === 'reaction') {
          reactions.push({ ...msg, n: ++reactionCount });
        } else if (msg.type === 'kicked') {
          forgetToken(code);
        } else if (msg.code === 'badToken') {
          forgetToken(code);
          rejoinRefused = true;
        } else if (msg.code === 'badName' || msg.code === 'nameTaken') {
          joinAs.current = undefined;
          setStatus({ kind: 'name', error: msg.code });
        } else if (
          msg.code === 'noRoom' ||
          (!joined && (msg.code === 'full' || msg.code === 'started'))
        ) {
          setStatus({ kind: 'ended', reason: msg.code });
        } else {
          setNotice(ERROR_TEXT[msg.code]);
        }
      };
      ws.onclose = (e) => {
        if (disposed || socket.current !== ws) return;
        const end = ENDS[e.code];
        if (end) {
          stopped = true;
          setStatus({ kind: 'ended', reason: end });
          return;
        }
        if (e.code === CLOSE.refused) {
          // A refused rejoin tries again as a new player; other refusals are final.
          if (rejoinRefused) {
            rejoinRefused = false;
            setStatus({ kind: 'connecting' });
            connect();
          } else {
            stopped = true;
          }
          return;
        }
        // The connection dropped: keep showing the room, and try again, backing off.
        setStatus((s) =>
          s.kind === 'joined' ? { ...s, connected: false } : { kind: 'connecting' },
        );
        retry = window.setTimeout(connect, Math.min(10_000, 1000 * 2 ** failures++));
      };
    };

    /** Drops this connection (without it counting as a drop) and opens another now. */
    const reconnectNow = () => {
      const old = socket.current;
      window.clearTimeout(retry);
      retry = undefined;
      failures = 0;
      if (old) {
        old.onopen = old.onmessage = old.onclose = null;
        old.close(1000);
      }
      setStatus((s) => (s.kind === 'joined' ? { ...s, connected: false } : s));
      connect();
    };
    /** A connection that's stuck opening, or silent too long, is replaced. */
    const check = (stale: number, eager: boolean) => {
      const ws = socket.current;
      if (disposed || stopped || !ws) return;
      // Waiting to try again after a drop: now, if there's reason to think it'll work.
      if (retry !== undefined) {
        if (eager) reconnectNow();
        return;
      }
      const quiet = Date.now() - heardAt;
      if (
        (ws.readyState === WebSocket.CONNECTING && quiet > OPENING_MS) ||
        (ws.readyState === WebSocket.OPEN && quiet > stale)
      ) {
        reconnectNow();
      }
    };
    // Coming back to the tab (a phone waking) or back online: check straight away,
    // as a socket can die silently meanwhile. Rooms can be quiet for long stretches,
    // so the regular check only replaces a connection that's stuck opening.
    const onVisible = () => {
      if (document.visibilityState === 'visible') check(STALE_MS, true);
    };
    const onOnline = () => check(STALE_MS, true);
    const interval = window.setInterval(() => check(Infinity, false), CHECK_MS);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);

    connect();
    return () => {
      disposed = true;
      window.clearTimeout(retry);
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      socket.current?.close(1000);
      socket.current = null;
    };
  }, [code, session, feedFor, watchFeedFor, reactions]);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(t);
  }, [notice]);

  return {
    status,
    notice,
    join: (name: string) => {
      saveName(name);
      joinAs.current = name;
      send({ type: 'join', name });
    },
    command: (command: RoomCommand) => send(command),
    match,
    /** Counts games in this room: it changes when a new one starts. */
    game,
    feedFor,
    watchFeedFor,
    /** Changes when a watched battle gets news, so screens can re-read the feeds. */
    watchTick,
    reactions,
    react: (match: string, emoji: Reaction) => send({ type: 'react', match, emoji }),
    /** Back to the room from a finished battle. */
    dismissMatch: () => setMatch((m) => (m?.stage === 'over' ? null : m)),
    team,
    redraw: () => send({ type: 'redraw' }),
    start: () => send({ type: 'start' }),
    playAgain: () => send({ type: 'playAgain' }),
    submitTeam: (slots: Slot[]) => send({ type: 'team', team: slots }),
    change: (change: Change | null) => send({ type: 'change', change }),
    ready: () => send({ type: 'ready' }),
    lead: (species: string) => send({ type: 'lead', species }),
    choose: (choice: string) => send({ type: 'choose', choice }),
    forfeit: () => {
      if (send({ type: 'forfeit' })) return;
      // Sent once you're back, rather than lost.
      forfeitLater.current = true;
      setNotice('Reconnecting… you’ll give up once you’re back.');
    },
    leave: () => {
      send({ type: 'leave' });
      forgetToken(code);
    },
    /** Reconnects after this room was opened in another tab. */
    reconnect: () => {
      setStatus({ kind: 'connecting' });
      setSession((n) => n + 1);
    },
  };
}
