// A versus room's rules, as pure functions over plain state (DESIGN.md §18).
// The room server holds the state and applies messages through these; the
// client only ever sees `roomView`, which leaves out every player's token and
// team. The game itself (build, rounds, lives) is in game.ts.
import { isDifficulty, type Difficulty } from '@daily-battle/ai/version';
import { DEFAULT_FORMAT, FORMATS, type FormatId } from '@daily-battle/data/formats';
import type { Match, MatchEnd, Side, Slot } from './match';

export const MAX_PLAYERS = 8;
/** People watching a game they joined after it started. */
export const MAX_SPECTATORS = 8;
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
  /** The host's week (its Monday, `YYYY-MM-DD`), for this week's pool. */
  week?: string;
  /** How hard the Rival plays (the AI that battles an odd player out). Missing is Normal. */
  rivalDifficulty?: Difficulty;
}

export const DEFAULT_SETTINGS: RoomSettings = {
  format: DEFAULT_FORMAT,
  lives: 2,
  timer: 'standard',
  pool: 'random',
};

/** The 12 Pokémon everyone builds from, and where they came from. */
export interface Pool {
  species: string[];
  source: 'random' | 'weekly';
  /** Which random draw (the host can redraw). */
  draw: number;
  week?: string;
}

export interface Player {
  id: string;
  name: string;
  /** Secret that lets this player back in after a disconnect. Never sent to others. */
  token: string;
  /** A handicap: how many Pokémon this player brings. */
  teamSize: TeamSize;
  /** Lives left in this game. */
  lives: number;
  /** Built from the pool; each round's change stays on it. Null until built. */
  team: Slot[] | null;
  /** Final placement (1 for the winner), once it's known. */
  place: number | null;
  /** The round they went out in. */
  outRound: number | null;
  /** Left mid-game: kept for the standings, out at the end of the round. */
  left: boolean;
  wins: number;
  losses: number;
  /** Last round's opponent, so pairing avoids a rematch. */
  lastOpponent: string | null;
  /** Rounds played against the AI, so the odd one out rotates. */
  aiRounds: number;
}

/** Someone who joined after the game started: they watch, and play in the next game. */
export interface Spectator {
  id: string;
  name: string;
  /** Secret that lets them back in after a disconnect. Never sent to others. */
  token: string;
}

/** How a finished battle went, by name (players may have left since). */
export interface MatchSummary {
  names: Record<Side, string>;
  players: Record<Side, string>;
  winner: Side | null;
  reason: MatchEnd;
}

/** A pairing for a round; `p2` may be the AI. */
export interface Pairing {
  p1: string;
  p2: string;
}

/** Bumped when the stored shape of a room changes; older rooms start over in the lobby. */
export const ROOM_VERSION = 5;

export interface RoomState {
  version: number;
  code: string;
  createdAt: number;
  /**
   * The lobby, building teams, a round's battles, the break between rounds,
   * or the end of a game.
   */
  phase: 'lobby' | 'build' | 'playing' | 'intermission' | 'over';
  /** The first player to join; passes to the next when the host leaves. */
  hostId: string | null;
  players: Player[];
  spectators: Spectator[];
  settings: RoomSettings;
  pool: Pool | null;
  /** When the build or the break between rounds ends. */
  deadline: number | null;
  /** Rounds played so far, counting the one in progress. */
  round: number;
  /** This round's battles. */
  matches: Match[];
  /** The next round's pairings, shown during the break. */
  next: Pairing[];
  /** How the last finished round went, and who went out in it. */
  lastRound: { round: number; matches: MatchSummary[]; out: string[] } | null;
}

/** What every player sees of the room: who plays whom and who's in, never teams. */
export interface RoomView {
  code: string;
  phase: RoomState['phase'];
  hostId: string | null;
  players: {
    id: string;
    name: string;
    teamSize: TeamSize;
    online: boolean;
    lives: number;
    built: boolean;
    place: number | null;
    outRound: number | null;
    left: boolean;
    wins: number;
    losses: number;
  }[];
  spectators: { id: string; name: string; online: boolean }[];
  settings: RoomSettings;
  pool: Pool | null;
  /** Time left in the build or the break; null otherwise. */
  timeLeftMs: number | null;
  round: number;
  matches: {
    id: string;
    players: Record<Side, string>;
    names: Record<Side, string>;
    stage: Match['stage'];
    winner: Side | null;
    /** Each side's team size and how many have fainted: Poké Balls, never species. */
    sizes: Record<Side, number>;
    fainted: Record<Side, number>;
  }[];
  next: Pairing[];
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
  | 'badTeam'
  | 'noPool'
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
  badTeam: 'That team isn’t allowed. Check it and try again.',
  noPool: 'There’s no pool for that week. The room keeps a random pool.',
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
    version: ROOM_VERSION,
    code,
    createdAt: now,
    phase: 'lobby',
    hostId: null,
    players: [],
    spectators: [],
    settings: { ...DEFAULT_SETTINGS },
    pool: null,
    deadline: null,
    round: 0,
    matches: [],
    next: [],
    lastRound: null,
  };
}

/**
 * A room saved by an older version of the server: back to the lobby with its
 * code, its players (and their seats), and its settings; any game is dropped.
 */
export function upgradeRoom(saved: RoomState): RoomState {
  if (saved.version === ROOM_VERSION) return saved;
  // Version 4 only lacked spectators and fainted counts; its game carries on.
  if (saved.version === 4) {
    return {
      ...saved,
      version: ROOM_VERSION,
      spectators: [],
      matches: saved.matches.map((m) => ({ ...m, fainted: m.fainted ?? { p1: 0, p2: 0 } })),
    };
  }
  const old = saved as Partial<RoomState> & Pick<RoomState, 'code' | 'createdAt' | 'players'>;
  const room = createRoom(old.code, old.createdAt);
  const settings = { ...room.settings, ...old.settings };
  return {
    ...room,
    hostId: old.hostId ?? old.players[0]?.id ?? null,
    settings,
    pool: old.pool ?? null,
    players: old.players.map((p) =>
      freshPlayer({ ...p, teamSize: p.teamSize ?? 6 }, settings.lives),
    ),
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

export const fail = (error: ErrorCode): Result => ({ ok: false, error });

/** A player as they start a game (or wait in the lobby for one). */
export const freshPlayer = (
  p: Pick<Player, 'id' | 'name' | 'token' | 'teamSize'>,
  lives: number,
): Player => ({
  id: p.id,
  name: p.name,
  token: p.token,
  teamSize: p.teamSize,
  lives,
  team: null,
  place: null,
  outRound: null,
  left: false,
  wins: 0,
  losses: 0,
  lastOpponent: null,
  aiRounds: 0,
});

/**
 * Adds someone. In the lobby they're a player (the first one in becomes the
 * host); once a game has started they watch it, and play in the next one.
 */
export function joinRoom(
  state: RoomState,
  input: { id: string; name: string; token: string },
): Result {
  const name = cleanName(input.name);
  if (!name) return fail('badName');
  const taken = [...state.players, ...state.spectators];
  if (taken.some((p) => p.name.toLowerCase() === name.toLowerCase())) return fail('nameTaken');
  if (state.phase !== 'lobby') {
    if (state.spectators.length >= MAX_SPECTATORS) return fail('full');
    return { ok: true, state: { ...state, spectators: [...state.spectators, { ...input, name }] } };
  }
  if (state.players.length >= MAX_PLAYERS) return fail('full');
  const player = freshPlayer({ ...input, name, teamSize: 6 }, state.settings.lives);
  return {
    ok: true,
    state: { ...state, hostId: state.hostId ?? player.id, players: [...state.players, player] },
  };
}

export const playerByToken = (state: RoomState, token: string): Player | undefined =>
  state.players.find((p) => p.token === token);

export const spectatorByToken = (state: RoomState, token: string): Spectator | undefined =>
  state.spectators.find((p) => p.token === token);

/**
 * Who may watch battles in progress: spectators, and players already out of
 * the game. Players still in can't (as in Showdown tournaments).
 */
export const canWatch = (state: RoomState, id: string) =>
  state.spectators.some((s) => s.id === id) ||
  state.players.some((p) => p.id === id && p.place !== null && !p.left);

/** Players still in the game: they have lives and haven't left. */
export const alive = (state: RoomState): Player[] =>
  state.players.filter((p) => p.lives > 0 && !p.left);

/**
 * Takes a player out of the room. In the lobby they're gone; mid-game they
 * stay in the standings, with no lives left (the room server forfeits their
 * battle first). The host passes to the next player still here.
 */
export function removePlayer(state: RoomState, id: string): RoomState {
  if (state.spectators.some((s) => s.id === id)) {
    return { ...state, spectators: state.spectators.filter((s) => s.id !== id) };
  }
  const players =
    state.phase === 'lobby'
      ? state.players.filter((p) => p.id !== id)
      : state.players.map((p) => (p.id === id ? { ...p, left: true, lives: 0 } : p));
  const here = players.filter((p) => p.id !== id && !p.left);
  const hostId = state.hostId === id ? (here[0]?.id ?? null) : state.hostId;
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
  if (!state.players.some((p) => p.id === by) && !state.spectators.some((s) => s.id === by)) {
    return fail('notJoined');
  }
  if (command.type === 'leave') return { ok: true, state: removePlayer(state, by) };
  // A player sets their own handicap; the host sets anyone's, and everything else.
  const own = command.type === 'teamSize' && command.player === by;
  if (state.hostId !== by && !own) return fail('notHost');
  // Removing works mid-game too (the room server forfeits their battle first).
  if (command.type !== 'kick' && state.phase !== 'lobby') return fail('started');
  switch (command.type) {
    case 'settings': {
      const settings = { ...state.settings, ...command.settings };
      const players = state.players.map((p) => ({ ...p, lives: settings.lives }));
      return { ok: true, state: { ...state, settings, players } };
    }
    case 'teamSize': {
      if (!state.players.some((p) => p.id === command.player)) return fail('badMessage');
      const players = state.players.map((p) =>
        p.id === command.player ? { ...p, teamSize: command.size } : p,
      );
      return { ok: true, state: { ...state, players } };
    }
    case 'kick':
      // The host leaves with "leave", not by kicking themselves.
      if (
        command.player === by ||
        ![...state.players, ...state.spectators].some((p) => p.id === command.player)
      ) {
        return fail('badMessage');
      }
      return { ok: true, state: removePlayer(state, command.player) };
  }
}

export function roomView(state: RoomState, online: ReadonlySet<string>, now: number): RoomView {
  return {
    code: state.code,
    phase: state.phase,
    hostId: state.hostId,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      teamSize: p.teamSize,
      online: online.has(p.id),
      lives: p.lives,
      built: !!p.team,
      place: p.place,
      outRound: p.outRound,
      left: p.left,
      wins: p.wins,
      losses: p.losses,
    })),
    spectators: state.spectators.map((s) => ({
      id: s.id,
      name: s.name,
      online: online.has(s.id),
    })),
    settings: state.settings,
    pool: state.pool,
    timeLeftMs: state.deadline === null ? null : Math.max(0, state.deadline - now),
    round: state.round,
    matches: state.matches.map((m) => ({
      id: m.id,
      players: m.players,
      names: m.names,
      stage: m.stage,
      winner: m.result?.winner ?? null,
      sizes: { p1: m.slots.p1.length, p2: m.slots.p2.length },
      fainted: m.fainted,
    })),
    next: state.next,
    lastRound: state.lastRound,
  };
}

/** The player's battle this round, if they have one. */
export const matchOf = (state: RoomState, player: string): Match | undefined =>
  state.matches.find((m) => m.players.p1 === player || m.players.p2 === player);

/** Puts back an updated battle. */
export const putMatch = (state: RoomState, match: Match): RoomState => ({
  ...state,
  matches: state.matches.map((m) => (m.id === match.id ? match : m)),
});

const WEEK = /^\d{4}-\d{2}-\d{2}$/;

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
    } else if (key === 'week' && typeof value === 'string' && WEEK.test(value)) {
      out.week = value;
    } else if (key === 'rivalDifficulty' && isDifficulty(value)) {
      out.rivalDifficulty = value;
    } else {
      return null;
    }
  }
  return out;
}

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
