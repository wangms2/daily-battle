// A game in a room (DESIGN.md §18): everyone builds from the pool, then
// rounds of battles until one player has lives left. Pure functions over the
// room's state; the room server deals teams, runs the battles, and keeps time.
import { AI_ID, SIDES, type Match, type Slot } from './match';
import {
  alive,
  fail,
  freshPlayer,
  MAX_PLAYERS,
  type ErrorCode,
  type MatchSummary,
  type Pairing,
  type Player,
  type Result,
  type RoomState,
} from './room';

/** How long everyone has to build a team. */
export const BUILD_MS = 180_000;
/** The break between rounds: the results, then who you face next. */
export const INTERMISSION_MS = 8_000;

/** Why `by` can't start a game now, or null if they can. */
export function cannotStartGame(state: RoomState, by: string): ErrorCode | null {
  if (!state.players.some((p) => p.id === by)) return 'notJoined';
  if (state.hostId !== by) return 'notHost';
  if (state.phase !== 'lobby') return 'started';
  if (state.players.length < 2) return 'notEnough';
  if (!state.pool) return 'noPool';
  return null;
}

/** Starts a game: everyone with full lives and no team, building against the clock. */
export function startBuild(state: RoomState, now: number): RoomState {
  return {
    ...state,
    phase: 'build',
    deadline: now + BUILD_MS,
    players: state.players.map((p) => freshPlayer(p, state.settings.lives)),
    round: 0,
    matches: [],
    next: [],
    lastRound: null,
  };
}

/**
 * Sets a player's team from the pool: their team size, distinct species, all
 * from the pool. (The room server checks set ids and legality first.)
 */
export function submitTeam(state: RoomState, by: string, team: Slot[]): Result {
  const player = state.players.find((p) => p.id === by);
  if (!player || player.left) return fail('notJoined');
  if (state.phase !== 'build' || player.team) return fail('notYourTurn');
  const species = team.map((s) => s.species);
  if (
    team.length !== player.teamSize ||
    new Set(species).size !== species.length ||
    !species.every((s) => state.pool!.species.includes(s))
  ) {
    return fail('badTeam');
  }
  return { ok: true, state: setPlayer(state, by, { team }) };
}

/** Everyone has built, or time is up. */
export const buildDone = (state: RoomState, now: number) =>
  state.phase === 'build' &&
  (state.players.every((p) => p.left || p.team) || now >= (state.deadline ?? 0));

/** Gives a team to anyone who didn't build one in time. */
export const fillTeams = (state: RoomState, auto: (p: Player) => Slot[]): RoomState => ({
  ...state,
  players: state.players.map((p) => (p.team || p.left ? p : { ...p, team: auto(p) })),
});

const shuffle = <T>(items: readonly T[], random: () => number): T[] => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
};

/**
 * Pairs the players still in, those with the same lives together when
 * possible and never last round's opponent if it can be helped. With an odd
 * count, one faces the AI: someone who has faced it least.
 */
export function pairByLives(players: readonly Player[], random: () => number): Pairing[] {
  let list = shuffle(players, random);
  const pairs: Pairing[] = [];
  if (list.length % 2) {
    const fewest = Math.min(...list.map((p) => p.aiRounds));
    const odd = list.find((p) => p.aiRounds === fewest)!;
    pairs.push({ p1: odd.id, p2: AI_ID });
    list = list.filter((p) => p !== odd);
  }
  // Every way to pair the rest (at most 105, for 8 players), keeping the best:
  // fewest rematches, then the smallest gaps in lives. The shuffle above
  // decides between equally good ones.
  const cost = (a: Player, b: Player) =>
    (a.lastOpponent === b.id || b.lastOpponent === a.id ? 100 : 0) + Math.abs(a.lives - b.lives);
  let best: { cost: number; pairs: Pairing[] } | null = null;
  const search = (rest: Player[], sofar: Pairing[], total: number) => {
    if (best && total >= best.cost) return;
    if (!rest.length) {
      best = { cost: total, pairs: sofar };
      return;
    }
    const [a, ...others] = rest;
    others.forEach((b, i) =>
      search(
        others.filter((_, j) => j !== i),
        [...sofar, { p1: a!.id, p2: b.id }],
        total + cost(a!, b),
      ),
    );
  };
  search(list, [], 0);
  pairs.push(...(best as { pairs: Pairing[] } | null)!.pairs);
  return pairs;
}

/** Starts a round with its battles, already paired and dealt. */
export const startRound = (state: RoomState, matches: Match[]): RoomState => ({
  ...state,
  phase: 'playing',
  round: state.round + 1,
  matches,
  next: [],
  deadline: null,
});

/** Every battle this round is over. */
export const roundDone = (state: RoomState) =>
  state.phase === 'playing' && state.matches.every((m) => m.stage === 'over');

const setPlayer = (state: RoomState, id: string, update: Partial<Player>): RoomState => ({
  ...state,
  players: state.players.map((p) => (p.id === id ? { ...p, ...update } : p)),
});

/**
 * Places everyone newly out, and ends the game if one player or none is left:
 * the last one in wins, and if the last ones all went out together they share
 * the win.
 */
function settle(state: RoomState, now: number, random: () => number): RoomState {
  const stillIn = alive(state);
  const place = stillIn.length + 1;
  const outNow = state.players.filter((p) => p.place === null && (p.lives <= 0 || p.left));
  let next: RoomState = {
    ...state,
    players: state.players.map((p) =>
      outNow.includes(p)
        ? { ...p, place: stillIn.length ? place : 1, outRound: state.round || null }
        : p,
    ),
  };
  if (stillIn.length <= 1) {
    if (stillIn[0]) next = setPlayer(next, stillIn[0].id, { place: 1 });
    return { ...next, phase: 'over', deadline: null, next: [], matches: [] };
  }
  if (state.phase === 'playing' || state.phase === 'intermission') {
    return {
      ...next,
      phase: 'intermission',
      deadline: state.phase === 'intermission' ? state.deadline : now + INTERMISSION_MS,
      next: pairByLives(alive(next), random),
      matches: [],
    };
  }
  return next;
}

/** Ends the round: lives and records, who's out, then the break or the end of the game. */
export function endRound(state: RoomState, now: number, random: () => number): RoomState {
  let next = state;
  const summaries: MatchSummary[] = [];
  for (const m of state.matches) {
    const winner = m.result?.winner ?? null;
    summaries.push({
      names: m.names,
      players: m.players,
      winner,
      reason: m.result?.reason ?? 'tie',
    });
    for (const side of SIDES) {
      const id = m.players[side];
      const player = next.players.find((p) => p.id === id);
      if (id === AI_ID || !player) continue;
      const won = winner === side;
      const foe = m.players[side === 'p1' ? 'p2' : 'p1'];
      // A tie costs both players a life.
      next = setPlayer(next, id, {
        lives: won ? player.lives : Math.max(0, player.lives - 1),
        wins: player.wins + (won ? 1 : 0),
        losses: player.losses + (won ? 0 : 1),
        lastOpponent: foe,
        aiRounds: player.aiRounds + (foe === AI_ID ? 1 : 0),
      });
    }
  }
  const outBefore = new Set(state.players.filter((p) => p.place !== null).map((p) => p.id));
  next = settle(next, now, random);
  const out = next.players.filter((p) => p.place !== null && !outBefore.has(p.id) && p.lives <= 0);
  return {
    ...next,
    lastRound: { round: state.round, matches: summaries, out: out.map((p) => p.id) },
  };
}

/**
 * After someone leaves between battles (building, or the break): the game
 * ends if one player or none is left, and the break pairs again without them.
 */
export function afterDeparture(state: RoomState, now: number, random: () => number): RoomState {
  if (state.phase === 'build') return alive(state).length <= 1 ? settle(state, now, random) : state;
  if (state.phase === 'intermission') return settle(state, now, random);
  return state;
}

/** Back to the lobby with the same players (those who left mid-game are gone). */
export function playAgain(state: RoomState, by: string): Result {
  if (state.hostId !== by) return fail('notHost');
  if (state.phase !== 'over') return fail('started');
  return {
    ok: true,
    state: {
      ...state,
      phase: 'lobby',
      deadline: null,
      round: 0,
      matches: [],
      next: [],
      lastRound: null,
      ...seats(state),
    },
  };
}

/** The next game's seats: everyone who stayed, then spectators while there's room. */
function seats(state: RoomState): Pick<RoomState, 'players' | 'spectators'> {
  const stayed = state.players.filter((p) => !p.left);
  const room = Math.max(0, MAX_PLAYERS - stayed.length);
  return {
    players: [
      ...stayed.map((p) => freshPlayer(p, state.settings.lives)),
      ...state.spectators
        .slice(0, room)
        .map((s) => freshPlayer({ ...s, teamSize: 6 }, state.settings.lives)),
    ],
    spectators: state.spectators.slice(room),
  };
}
