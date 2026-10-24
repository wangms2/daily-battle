// A connection to one versus room: joins (or rejoins with a saved token),
// keeps the latest room, and reconnects when the connection drops.
import {
  CLOSE,
  ERROR_TEXT,
  parseServerMessage,
  type ClientMessage,
  type ErrorCode,
  type MatchView,
  type RoomCommand,
  type RoomView,
  type ServerMessage,
} from '@daily-battle/versus';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Feed } from './feed';
import { forgetToken, saveName, saveToken, tokenFor } from './saved';

export type SideMessage = Extract<ServerMessage, { type: 'side' }>;

/** Your battle as the room last described it, and when that was (its clock counts from then). */
export type LocalMatch = MatchView & { receivedAt: number };

/** Why you're no longer in a room. */
export type EndReason = 'noRoom' | 'full' | 'started' | 'kicked' | 'replaced' | 'left';

export type RoomStatus =
  | { kind: 'connecting' }
  /** Connected; pick a name to join (again, if the last one was taken). */
  | { kind: 'name'; error?: ErrorCode }
  | { kind: 'joined'; you: string; room: RoomView; connected: boolean }
  | { kind: 'ended'; reason: EndReason };

const ENDS: Partial<Record<number, EndReason>> = {
  [CLOSE.noRoom]: 'noRoom',
  [CLOSE.kicked]: 'kicked',
  [CLOSE.replaced]: 'replaced',
  [CLOSE.left]: 'left',
};

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
  /** Each battle's lines, by match id. */
  const feeds = useRef(new Map<string, Feed<SideMessage>>());
  const feedFor = useCallback((id: string) => {
    let feed = feeds.current.get(id);
    if (!feed) feeds.current.set(id, (feed = new Feed()));
    return feed;
  }, []);

  const send = useCallback((msg: ClientMessage) => {
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify(msg));
  }, []);

  useEffect(() => {
    let disposed = false;
    let retry: number | undefined;
    let failures = 0;
    /** A rejoin was refused (you were removed meanwhile): reconnect and join afresh. */
    let rejoinRefused = false;

    const connect = () => {
      const ws = new WebSocket(socketUrl(code));
      socket.current = ws;
      const sendHere = (msg: ClientMessage) => ws.send(JSON.stringify(msg));
      let joined = false;
      ws.onopen = () => {
        failures = 0;
        const token = tokenFor(code);
        if (token) sendHere({ type: 'rejoin', token });
        else if (joinAs.current) sendHere({ type: 'join', name: joinAs.current });
        else setStatus({ kind: 'name' });
      };
      ws.onmessage = (e) => {
        const msg = parseServerMessage(e.data);
        if (!msg) return;
        if (msg.type === 'welcome') {
          joined = true;
          saveToken(code, msg.token);
          joinAs.current = undefined;
          setStatus({ kind: 'joined', you: msg.you, room: msg.room, connected: true });
        } else if (msg.type === 'room') {
          setStatus((s) => (s.kind === 'joined' ? { ...s, room: msg.room, connected: true } : s));
        } else if (msg.type === 'match') {
          const next = msg.match && { ...msg.match, receivedAt: Date.now() };
          // A finished battle stays up until you go back to the room.
          setMatch((m) => (next || !m || m.stage !== 'over' ? next : m));
        } else if (msg.type === 'side') {
          feedFor(msg.match).push(msg);
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
          setStatus({ kind: 'ended', reason: end });
          return;
        }
        if (e.code === CLOSE.refused) {
          // A refused rejoin tries again as a new player; other refusals are final.
          if (rejoinRefused) {
            rejoinRefused = false;
            setStatus({ kind: 'connecting' });
            connect();
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

    connect();
    return () => {
      disposed = true;
      window.clearTimeout(retry);
      socket.current?.close(1000);
      socket.current = null;
    };
  }, [code, session, feedFor]);

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
    feedFor,
    /** Back to the room from a finished battle. */
    dismissMatch: () => setMatch((m) => (m?.stage === 'over' ? null : m)),
    start: () => send({ type: 'start' }),
    lead: (species: string) => send({ type: 'lead', species }),
    choose: (choice: string) => send({ type: 'choose', choice }),
    forfeit: () => send({ type: 'forfeit' }),
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
