// The messages between a room and its players, sent as JSON over a websocket.
// Everything a client sends is untrusted: `parseClientMessage` checks it
// before the room looks at it.
import {
  isRecord,
  NAME_MAX,
  TEAM_SIZES,
  validSettings,
  type ErrorCode,
  type RoomCommand,
  type RoomView,
  type TeamSize,
} from './room';

export type ClientMessage =
  /** The first message on a socket: a new player, or one coming back with their token. */
  { type: 'join'; name: string } | { type: 'rejoin'; token: string } | RoomCommand;

export type ServerMessage =
  /** You're in: your id, the token to rejoin with, and the room. */
  | { type: 'welcome'; you: string; token: string; room: RoomView }
  | { type: 'room'; room: RoomView }
  | { type: 'error'; code: ErrorCode }
  /** The host removed you; the socket closes after this. */
  | { type: 'kicked' };

/** Websocket close codes a room uses (4000–4999 are free for applications). */
export const CLOSE = {
  /** The room doesn't exist or is gone. */
  noRoom: 4004,
  /** Couldn't join (full, started, name taken, or a bad token). */
  refused: 4003,
  kicked: 4001,
  /** The same player connected again elsewhere (another tab). */
  replaced: 4002,
  left: 4000,
} as const;

/** Longest message a room accepts, in characters. */
export const MESSAGE_MAX = 2048;

const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 64;

/** A client message, or null if it isn't one of ours. */
export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (typeof raw !== 'string' || raw.length > MESSAGE_MAX) return null;
  let msg: unknown;
  try {
    msg = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(msg)) return null;
  switch (msg.type) {
    case 'join':
      return typeof msg.name === 'string' && msg.name.length <= NAME_MAX * 4
        ? { type: 'join', name: msg.name }
        : null;
    case 'rejoin':
      return isId(msg.token) ? { type: 'rejoin', token: msg.token } : null;
    case 'settings': {
      const settings = validSettings(msg.settings);
      return settings ? { type: 'settings', settings } : null;
    }
    case 'teamSize':
      return isId(msg.player) && TEAM_SIZES.includes(msg.size as TeamSize)
        ? { type: 'teamSize', player: msg.player, size: msg.size as TeamSize }
        : null;
    case 'kick':
      return isId(msg.player) ? { type: 'kick', player: msg.player } : null;
    case 'leave':
      return { type: 'leave' };
    default:
      return null;
  }
}

/** A server message, or null if it can't be parsed (the client trusts its own server's shape). */
export function parseServerMessage(raw: unknown): ServerMessage | null {
  if (typeof raw !== 'string') return null;
  try {
    const msg: unknown = JSON.parse(raw);
    return isRecord(msg) && typeof msg.type === 'string' ? (msg as ServerMessage) : null;
  } catch {
    return null;
  }
}
