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
import type { Change, MatchView, Side, Slot } from './match';

export type ClientMessage =
  /** The first message on a socket: a new player, or one coming back with their token. */
  | { type: 'join'; name: string }
  | { type: 'rejoin'; token: string }
  | RoomCommand
  /** The host: draw another random pool, start a game, or play again after one. */
  | { type: 'redraw' }
  | { type: 'start' }
  | { type: 'playAgain' }
  /** Your team, built from the pool. */
  | { type: 'team'; team: Slot[] }
  /** Before your battle: your one change (or none), your lead, and that you're ready. */
  | { type: 'change'; change: Change | null }
  | { type: 'lead'; species: string }
  | { type: 'ready' }
  /** In your battle: make a choice (`move 2`, `switch 4`), or give up. */
  | { type: 'choose'; choice: string }
  | { type: 'forfeit' }
  /** Watching: a reaction to a battle. */
  | { type: 'react'; match: string; emoji: Reaction };

/** The reactions spectators can send. */
export const REACTIONS = ['😮', '🔥', '😂', '💀', '💩', '👀'] as const;
export type Reaction = (typeof REACTIONS)[number];

/**
 * A battle as spectators see it since `from` lines in: its public log (no
 * hidden sets, HP as percentages), and the end. `resync` when it's the whole
 * battle so far.
 */
export interface WatchUpdate {
  match: string;
  from: number;
  lines: string[];
  ended: boolean;
  winner: Side | null;
  resync?: boolean;
}

/**
 * One side's view of its battle since `from` lines in: new protocol lines,
 * the pending request, and the end. The client turns it into frames with
 * SidePresenter (apps/web/src/battle/presenter.ts).
 */
export interface WireUpdate {
  lines: string[];
  /** A parsed @pkmn/protocol request, or null while waiting or once it's over. */
  request: unknown;
  ended: boolean;
  winner: Side | null;
  /** Your last choice was blocked by something you couldn't see (Imprison); choose again. */
  blocked?: boolean;
}

export type ServerMessage =
  /** You're in: your id, the token to rejoin with, and the room. */
  | { type: 'welcome'; you: string; token: string; room: RoomView }
  | { type: 'room'; room: RoomView }
  /** Your own team (null before you've built one). */
  | { type: 'team'; team: Slot[] | null }
  /** Your battle this round (null when you have none). */
  | { type: 'match'; match: MatchView | null }
  /** Battle lines for your side; `resync` when it's the whole battle so far, after a reconnect. */
  | { type: 'side'; match: string; from: number; update: WireUpdate; resync?: boolean }
  /** Watching (out of the game, or a spectator): a battle's public log. */
  | ({ type: 'watch' } & WatchUpdate)
  /** A spectator's reaction to a battle, for the battle's players and everyone watching. */
  | { type: 'reaction'; match: string; emoji: Reaction; from: string }
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

/** The choices a player makes in singles: one of four moves, or a switch to one of six. */
const CHOICE = /^(move [1-4]|switch [1-6])$/;

const isName = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 64;

/** A team slot from the network: a species and a set id. */
function slotOf(v: unknown): Slot | null {
  return isRecord(v) && isName(v.species) && isName(v.setId)
    ? { species: v.species, setId: v.setId }
    : null;
}

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
    case 'start':
    case 'redraw':
    case 'playAgain':
    case 'ready':
      return { type: msg.type };
    case 'team': {
      if (!Array.isArray(msg.team) || msg.team.length < 1 || msg.team.length > 6) return null;
      const team = msg.team.map(slotOf);
      return team.every(Boolean) ? { type: 'team', team: team as Slot[] } : null;
    }
    case 'change': {
      if (msg.change === null) return { type: 'change', change: null };
      if (!isRecord(msg.change)) return null;
      const { slot } = msg.change;
      const to = slotOf(msg.change.to);
      return Number.isInteger(slot) && (slot as number) >= 0 && (slot as number) < 6 && to
        ? { type: 'change', change: { slot: slot as number, to } }
        : null;
    }
    case 'forfeit':
      return { type: 'forfeit' };
    case 'lead':
      return isName(msg.species) ? { type: 'lead', species: msg.species } : null;
    case 'choose':
      return typeof msg.choice === 'string' && CHOICE.test(msg.choice)
        ? { type: 'choose', choice: msg.choice }
        : null;
    case 'react':
      return isId(msg.match) && REACTIONS.includes(msg.emoji as Reaction)
        ? { type: 'react', match: msg.match, emoji: msg.emoji as Reaction }
        : null;
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
