// A versus room's rules, as pure functions over plain state (DESIGN.md §18).
// The room server holds the state and applies messages through these; the
// client only ever sees `roomView`, which leaves out every player's token.
import { DEFAULT_FORMAT, FORMATS, type FormatId } from '@daily-battle/data/formats';
import type { Match, MatchEnd, Side } from './match';

export const MAX_PLAYERS = 8;
export const NAME_MAX = 16;
export const LIVES_MIN = 1;
export const LIVES_MAX = 5;
export const TEAM_SIZES = [6, 5, 4, 3] as const;
export type TeamSize = (typeof TEAM_SIZES)[number];

/** Turn timers, like Showdown's: a bank for the whole battle and a cap on any one turn. */
export const TIMERS = {
  fast: { name: 'Fast', bank: 120, perTurn: 30 },
  standard: { name: 'Standard', bank: 240, perTurn: 60 },
  relaxed: { name: 'Relaxed', bank: 480, perTurn: 120 },
} as const;
export type TimerId = keyof typeof TIMERS;

export interface RoomSettings {
  format: FormatId;
  lives: number;
  timer: TimerId;
  /** A new random pool for the room, or this week's daily pool for the game. */
  pool: 'random' | 'weekly';
}

export const DEFAULT_SETTINGS: RoomSettings = {
  format: DEFAULT_FORMAT,
  lives: 2,
  timer: 'standard',
  pool: 'random',
};

export interface Player {
  id: string;
  name: string;
  /** Secret that lets this player back in after a disconnect. Never sent to others. */
  token: string;
  /** A handicap: how many Pokémon this player brings. */
  teamSize: TeamSize;
}

/** How a finished battle went, by name (players may have left since). */
export interface MatchSummary {
  names: Record<Side, string>;
  players: Record<Side, string>;
  winner: Side | null;
  reason: MatchEnd;
}

export interface RoomState {
  code: string;
  createdAt: number;
  /** In the lobby between rounds, or playing a round's battles. */
  phase: 'lobby' | 'playing';
  /** The first player to join; passes to the next when the host leaves. */
  hostId: string | null;
  players: Player[];
  settings: RoomSettings;
  /** Rounds played so far, counting the one in progress. */
  round: number;
  /** This round's battles (empty in the lobby). */
  matches: Match[];
  /** Who sits this round out, with an odd number of players. */
  sittingOut: string | null;
  /** How the last finished round went. */
  lastRound: { round: number; matches: MatchSummary[]; sittingOut: string | null } | null;
}

/** What every player sees of the room: who plays whom, never teams. */
export interface RoomView {
  code: string;
  phase: RoomState['phase'];
  hostId: string | null;
  players: { id: string; name: string; teamSize: TeamSize; online: boolean }[];
  settings: RoomSettings;
  round: number;
  matches: {
    id: string;
    players: Record<Side, string>;
    stage: Match['stage'];
    winner: Side | null;
  }[];
  sittingOut: string | null;
  lastRound: RoomState['lastRound'];
}

export type ErrorCode =
  | 'noRoom'
  | 'full'
  | 'started'
  | 'badName'
  | 'nameTaken'
  | 'badToken'
  | 'notHost'
  | 'notJoined'
  | 'notEnough'
  | 'notYourTurn'
  | 'badMessage';

export const ERROR_TEXT: Record<ErrorCode, string> = {
  noRoom: 'That room doesn’t exist, or it has closed.',
  full: `That room is full (${MAX_PLAYERS} players).`,
  started: 'That room has already started.',
  badName: `Pick a name of 1–${NAME_MAX} characters.`,
  nameTaken: 'Someone in the room already has that name.',
  badToken: 'You’re no longer in that room.',
  notHost: 'Only the host can do that.',
  notJoined: 'Join the room first.',
  notEnough: 'You need at least two players to start.',
  notYourTurn: 'That choice isn’t available right now.',
  badMessage: 'Something went wrong. Try reloading.',
};

/** Unambiguous letters for room codes: no vowels (no words), no I/O/U look-alikes. */
const CODE_LETTERS = 'BCDFGHJKLMNPQRSTVWXZ';
export const CODE_LENGTH = 5;
export const CODE_PATTERN = new RegExp(`^[${CODE_LETTERS}]{${CODE_LENGTH}}$`);

/** A room code from a source of random numbers in [0, 1). */
export function makeCode(random: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_LETTERS[Math.floor(random() * CODE_LETTERS.length)];
  }
  return code;
}

/** A code as typed (any case, stray spaces), or null if it can't be one. */
export function normalizeCode(input: string): string | null {
  const code = input.replace(/\s+/g, '').toUpperCase();
  return CODE_PATTERN.test(code) ? code : null;
}

export function createRoom(code: string, now: number): RoomState {
  return {
    code,
    createdAt: now,
    phase: 'lobby',
    hostId: null,
    players: [],
    settings: { ...DEFAULT_SETTINGS },
    round: 0,
    matches: [],
    sittingOut: null,
    lastRound: null,
  };
}

/** A name with spaces collapsed, or null if it's empty, too long, or has control characters. */
export function cleanName(input: string): string | null {
  const name = input.replace(/\s+/g, ' ').trim();
  // eslint-disable-next-line no-control-regex
  if (!name || [...name].length > NAME_MAX || /[\u0000-\u001f\u007f]/.test(name)) return null;
  return name;
}

export type Result = { ok: true; state: RoomState } | { ok: false; error: ErrorCode };

const fail = (error: ErrorCode): Result => ({ ok: false, error });

/** Adds a player. The first one in becomes the host. */
export function joinRoom(
  state: RoomState,
  input: { id: string; name: string; token: string },
): Result {
  if (state.phase !== 'lobby') return fail('started');
  if (state.players.length >= MAX_PLAYERS) return fail('full');
  const name = cleanName(input.name);
  if (!name) return fail('badName');
  if (state.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    return fail('nameTaken');
  }
  const player: Player = { id: input.id, name, token: input.token, teamSize: 6 };
  return {
    ok: true,
    state: { ...state, hostId: state.hostId ?? player.id, players: [...state.players, player] },
  };
}

export const playerByToken = (state: RoomState, token: string): Player | undefined =>
  state.players.find((p) => p.token === token);

/** Removes a player; the host passes to whoever joined next. */
export function removePlayer(state: RoomState, id: string): RoomState {
  const players = state.players.filter((p) => p.id !== id);
  const hostId = state.hostId === id ? (players[0]?.id ?? null) : state.hostId;
  return { ...state, players, hostId };
}

/** What a joined player can ask the room to do. Joining itself is separate (`joinRoom`). */
export type RoomCommand =
  | { type: 'settings'; settings: Partial<RoomSettings> }
  | { type: 'teamSize'; player: string; size: TeamSize }
  | { type: 'kick'; player: string }
  | { type: 'leave' };

/** Applies a command from player `by`. */
export function applyCommand(state: RoomState, by: string, command: RoomCommand): Result {
  if (!state.players.some((p) => p.id === by)) return fail('notJoined');
  if (command.type === 'leave') return { ok: true, state: removePlayer(state, by) };
  if (state.hostId !== by) return fail('notHost');
  // Removing works mid-round too (the room server forfeits their battle first).
  if (command.type !== 'kick' && state.phase !== 'lobby') return fail('started');
  switch (command.type) {
    case 'settings':
      return {
        ok: true,
        state: { ...state, settings: { ...state.settings, ...command.settings } },
      };
    case 'teamSize': {
      if (!state.players.some((p) => p.id === command.player)) return fail('badMessage');
      const players = state.players.map((p) =>
        p.id === command.player ? { ...p, teamSize: command.size } : p,
      );
      return { ok: true, state: { ...state, players } };
    }
    case 'kick':
      // The host leaves with "leave", not by kicking themselves.
      if (command.player === by) return fail('badMessage');
      return { ok: true, state: removePlayer(state, command.player) };
  }
}

export function roomView(state: RoomState, online: ReadonlySet<string>): RoomView {
  return {
    code: state.code,
    phase: state.phase,
    hostId: state.hostId,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      teamSize: p.teamSize,
      online: online.has(p.id),
    })),
    settings: state.settings,
    round: state.round,
    matches: state.matches.map((m) => ({
      id: m.id,
      players: m.players,
      stage: m.stage,
      winner: m.result?.winner ?? null,
    })),
    sittingOut: state.sittingOut,
    lastRound: state.lastRound,
  };
}

/** Why `by` can't start a round now, or null if they can. */
export function cannotStart(state: RoomState, by: string): ErrorCode | null {
  if (!state.players.some((p) => p.id === by)) return 'notJoined';
  if (state.hostId !== by) return 'notHost';
  if (state.phase !== 'lobby') return 'started';
  if (state.players.length < 2) return 'notEnough';
  return null;
}

/** Starts a round with its battles, already paired and dealt. */
export function startRound(
  state: RoomState,
  matches: Match[],
  sittingOut: string | null,
): RoomState {
  return { ...state, phase: 'playing', round: state.round + 1, matches, sittingOut };
}

/** The player's battle this round, if they have one. */
export const matchOf = (state: RoomState, player: string): Match | undefined =>
  state.matches.find((m) => m.players.p1 === player || m.players.p2 === player);

/** Puts back an updated battle; once every battle is over, the room returns to the lobby. */
export function putMatch(state: RoomState, match: Match): RoomState {
  const matches = state.matches.map((m) => (m.id === match.id ? match : m));
  if (matches.some((m) => m.stage !== 'over')) return { ...state, matches };
  return {
    ...state,
    phase: 'lobby',
    matches: [],
    sittingOut: null,
    lastRound: {
      round: state.round,
      sittingOut: state.sittingOut,
      matches: matches.map((m) => ({
        names: m.names,
        players: m.players,
        winner: m.result?.winner ?? null,
        reason: m.result?.reason ?? 'tie',
      })),
    },
  };
}

/** Checks a partial settings object from the network; null if any field is invalid. */
export function validSettings(input: unknown): Partial<RoomSettings> | null {
  if (!isRecord(input)) return null;
  const out: Partial<RoomSettings> = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === 'format' && typeof value === 'string' && Object.hasOwn(FORMATS, value)) {
      out.format = value as FormatId;
    } else if (
      key === 'lives' &&
      Number.isInteger(value) &&
      (value as number) >= LIVES_MIN &&
      (value as number) <= LIVES_MAX
    ) {
      out.lives = value as number;
    } else if (key === 'timer' && typeof value === 'string' && Object.hasOwn(TIMERS, value)) {
      out.timer = value as TimerId;
    } else if (key === 'pool' && (value === 'random' || value === 'weekly')) {
      out.pool = value;
    } else {
      return null;
    }
  }
  return out;
}

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
