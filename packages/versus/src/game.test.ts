import { describe, expect, it } from 'vitest';
import {
  afterDeparture,
  buildDone,
  BUILD_MS,
  cannotStartGame,
  endRound,
  fillTeams,
  pairByLives,
  playAgain,
  startBuild,
  startRound,
  submitTeam,
} from './game';
import { AI_ID, newMatch, type Match, type Slot } from './match';
import {
  alive,
  applyCommand,
  canWatch,
  createRoom,
  dealPools,
  joinRoom,
  poolOf,
  type Player,
  type Result,
  type RoomState,
} from './room';

const ok = (r: Result): RoomState => {
  if (!r.ok) throw new Error(`expected ok, got ${r.error}`);
  return r.state;
};

const POOL = 'ABCDEFGHIJKL'.split('').map((c) => `Mon${c}`);
const team = (n: number, from = 0): Slot[] =>
  POOL.slice(from, from + n).map((species) => ({ species, setId: 'x' }));

/** Not random: a fixed sequence, so pairings are repeatable. */
const seq = () => {
  let n = 0;
  return () => (n++ * 0.618) % 1;
};

function room(names: string[], lives = 2): RoomState {
  let s = createRoom('BCDFG', 0);
  names.forEach((name, i) => (s = ok(joinRoom(s, { id: `id${i}`, name, token: `t${i}` }))));
  s = ok(applyCommand(s, 'id0', { type: 'settings', settings: { lives } }));
  return { ...s, pool: { species: POOL, source: 'random', draw: 0 } };
}

/** A finished battle between two ids, won by `winner` (or a tie). */
function result(p1: string, p2: string, winner: 'p1' | 'p2' | null): Match {
  const m = newMatch({
    id: `${p1}-${p2}`,
    players: { p1, p2 },
    names: { p1, p2 },
    ai: p2 === AI_ID ? 'p2' : null,
    format: 'gen4ou',
    seed: '1,1,1,1',
    slots: { p1: team(3), p2: team(3, 3) },
    bankMs: 1000,
    now: 0,
  });
  return { ...m, stage: 'over', result: { winner, reason: winner ? 'win' : 'tie' } };
}

describe('starting and building', () => {
  it('needs the host, two players, and a pool', () => {
    expect(cannotStartGame(room(['Ash']), 'id0')).toBe('notEnough');
    expect(cannotStartGame(room(['Ash', 'Misty']), 'id1')).toBe('notHost');
    expect(cannotStartGame({ ...room(['Ash', 'Misty']), pool: null }, 'id0')).toBe('noPool');
    expect(cannotStartGame(room(['Ash', 'Misty']), 'id0')).toBeNull();
  });

  it('takes each player’s team at their size, from the pool, and fills in late ones', () => {
    let s = startBuild(room(['Ash', 'Misty']), 0);
    expect(s.players.every((p) => p.lives === 2 && !p.team)).toBe(true);
    expect(submitTeam(s, 'id0', team(5)).ok).toBe(false);
    expect(submitTeam(s, 'id0', [...team(5), team(1)[0]!]).ok).toBe(false); // a repeat
    expect(submitTeam(s, 'id0', [...team(5), { species: 'Mew', setId: 'x' }]).ok).toBe(false);
    s = ok(submitTeam(s, 'id0', team(6)));
    expect(buildDone(s, 1000)).toBe(false);
    expect(buildDone(s, BUILD_MS)).toBe(true);
    s = fillTeams(s, (p) => team(p.teamSize, 6));
    expect(s.players[1]!.team).toEqual(team(6, 6));
    expect(s.players[0]!.team).toEqual(team(6));
  });

  it('builds from each player’s own 12, kept through a new game', () => {
    const OTHER = 'MNOPQRSTUVWX'.split('').map((c) => `Mon${c}`);
    let s = dealPools(room(['Ash', 'Misty']), (p) => (p.id === 'id0' ? POOL : OTHER));
    expect(poolOf(s, 'id0')).toEqual(POOL);
    expect(poolOf(s, 'id1')).toEqual(OTHER);
    s = startBuild(s, 0);
    expect(poolOf(s, 'id1')).toEqual(OTHER);
    expect(submitTeam(s, 'id1', team(6)).ok).toBe(false); // Ash's Pokémon
    s = ok(
      submitTeam(
        s,
        'id1',
        OTHER.slice(0, 6).map((species) => ({ species, setId: 'x' })),
      ),
    );
    expect(s.players[1]!.team).toHaveLength(6);
  });
});

describe('dealPools', () => {
  const draw = (p: Player) => [`${p.id}-pool`];

  it('gives a random 12 to anyone without one, and redraws all when fresh', () => {
    const s = dealPools(room(['Ash', 'Misty']), draw);
    expect(s.players.map((p) => p.pool)).toEqual([['id0-pool'], ['id1-pool']]);
    expect(dealPools(s, () => ['new'])).toBe(s);
    expect(dealPools(s, () => ['new'], true).players.map((p) => p.pool)).toEqual([
      ['new'],
      ['new'],
    ]);
  });

  it('shares the room’s pool in weekly mode, and leaves a game alone', () => {
    const s = dealPools(room(['Ash', 'Misty']), draw);
    const weekly = { ...s, settings: { ...s.settings, pool: 'weekly' as const } };
    expect(dealPools(weekly, draw).players.map((p) => p.pool)).toEqual([null, null]);
    expect(poolOf(dealPools(weekly, draw), 'id1')).toEqual(POOL);
    const playing = { ...room(['Ash', 'Misty']), phase: 'build' as const };
    expect(dealPools(playing, draw)).toBe(playing);
    // A player from a room older than their own pools builds from the room's.
    expect(poolOf(playing, 'id0')).toEqual(POOL);
  });
});

describe('pairByLives', () => {
  const player = (id: string, lives: number, extra: Partial<Player> = {}) =>
    ({ id, lives, lastOpponent: null, aiRounds: 0, ...extra }) as Player;

  it('pairs players with the same lives', () => {
    const pairs = pairByLives(
      [player('a', 2), player('b', 1), player('c', 2), player('d', 1)],
      seq(),
    );
    const byId = (id: string) => pairs.find((p) => p.p1 === id || p.p2 === id)!;
    expect([byId('a').p1, byId('a').p2].sort()).toEqual(['a', 'c']);
    expect([byId('b').p1, byId('b').p2].sort()).toEqual(['b', 'd']);
  });

  it('avoids last round’s rematch when it can', () => {
    const pairs = pairByLives(
      [
        player('a', 2, { lastOpponent: 'b' }),
        player('b', 2, { lastOpponent: 'a' }),
        player('c', 2),
        player('d', 2),
      ],
      seq(),
    );
    for (const p of pairs) expect([p.p1, p.p2].sort()).not.toEqual(['a', 'b']);
  });

  it('sends one odd player to the AI, someone who has faced it least', () => {
    const pairs = pairByLives(
      [player('a', 2, { aiRounds: 1 }), player('b', 2), player('c', 2, { aiRounds: 1 })],
      seq(),
    );
    expect(pairs).toContainEqual({ p1: 'b', p2: AI_ID });
    expect(pairs).toHaveLength(2);
  });
});

describe('rounds', () => {
  const playing = (names: string[], lives = 2) =>
    startRound(
      fillTeams(startBuild(room(names, lives), 0), (p) => team(p.teamSize)),
      [],
    );

  it('takes a life from the loser, both on a tie, and none from an AI', () => {
    let s = playing(['Ash', 'Misty', 'Brock', 'Gary', 'Red']);
    s = {
      ...s,
      matches: [result('id0', 'id1', 'p1'), result('id2', 'id3', null), result('id4', AI_ID, 'p1')],
    };
    s = endRound(s, 1000, seq());
    const lives = Object.fromEntries(s.players.map((p) => [p.name, p.lives]));
    expect(lives).toEqual({ Ash: 2, Misty: 1, Brock: 1, Gary: 1, Red: 2 });
    expect(s.phase).toBe('intermission');
    expect(s.deadline).toBe(1000 + 8000);
    expect(s.players.find((p) => p.name === 'Red')!.aiRounds).toBe(1);
    expect(s.lastRound!.matches).toHaveLength(3);
    // Next round: everyone still in is paired once.
    const ids = s.next.flatMap((p) => [p.p1, p.p2]).filter((id) => id !== AI_ID);
    expect(ids.sort()).toEqual(['id0', 'id1', 'id2', 'id3', 'id4']);
  });

  it('places players as they go out, and ends with a winner', () => {
    let s = playing(['Ash', 'Misty', 'Brock'], 1);
    s = { ...s, matches: [result('id0', 'id1', 'p1'), result('id2', AI_ID, 'p1')] };
    s = endRound(s, 0, seq());
    expect(s.phase).toBe('intermission');
    expect(s.players[1]!.place).toBe(3);
    expect(s.players[1]!.outRound).toBe(1);
    expect(s.lastRound!.out).toEqual(['id1']);
    s = startRound(s, [result('id0', 'id2', 'p2')]);
    s = endRound(s, 0, seq());
    expect(s.phase).toBe('over');
    expect(s.players.map((p) => [p.name, p.place])).toEqual([
      ['Ash', 2],
      ['Misty', 3],
      ['Brock', 1],
    ]);
  });

  it('shares the win when the last players go out together', () => {
    let s = playing(['Ash', 'Misty'], 1);
    s = { ...s, matches: [result('id0', 'id1', null)] };
    s = endRound(s, 0, seq());
    expect(s.phase).toBe('over');
    expect(s.players.map((p) => p.place)).toEqual([1, 1]);
  });

  it('ends the game if someone leaves and one player is left', () => {
    let s = playing(['Ash', 'Misty', 'Brock'], 2);
    s = endRound(
      { ...s, matches: [result('id0', 'id1', 'p1'), result('id2', AI_ID, 'p1')] },
      0,
      seq(),
    );
    s = ok(applyCommand(s, 'id1', { type: 'leave' }));
    s = afterDeparture(s, 0, seq());
    expect(s.phase).toBe('intermission');
    expect(s.next.flatMap((p) => [p.p1, p.p2])).not.toContain('id1');
    expect(s.players[1]!.place).toBe(3);
    s = ok(applyCommand(s, 'id2', { type: 'leave' }));
    s = afterDeparture(s, 0, seq());
    expect(s.phase).toBe('over');
    expect(alive(s).map((p) => p.name)).toEqual(['Ash']);
    expect(s.players[0]!.place).toBe(1);
  });

  it('plays again with the same players, minus those who left', () => {
    let s = playing(['Ash', 'Misty', 'Brock'], 1);
    s = ok(applyCommand(s, 'id2', { type: 'leave' }));
    s = endRound({ ...s, matches: [result('id0', 'id1', 'p1')] }, 0, seq());
    expect(s.phase).toBe('over');
    expect(playAgain(s, 'id1').ok).toBe(false);
    s = ok(playAgain(s, 'id0'));
    expect(s.phase).toBe('lobby');
    expect(s.players.map((p) => [p.name, p.lives, p.place, p.team])).toEqual([
      ['Ash', 1, null, null],
      ['Misty', 1, null, null],
    ]);
  });
});

describe('spectators', () => {
  const started = () => startBuild(room(['Ash', 'Misty']), 0);

  it('lets someone join a game under way as a spectator, with a unique name', () => {
    let s = started();
    s = ok(joinRoom(s, { id: 'sp', name: 'Oak', token: 'tsp' }));
    expect(s.players).toHaveLength(2);
    expect(s.spectators.map((x) => x.name)).toEqual(['Oak']);
    expect(joinRoom(s, { id: 'x', name: 'oak', token: 'x' })).toEqual({
      ok: false,
      error: 'nameTaken',
    });
    expect(joinRoom(s, { id: 'x', name: 'ash', token: 'x' })).toEqual({
      ok: false,
      error: 'nameTaken',
    });
  });

  it('lets spectators and players who are out watch, but not players still in', () => {
    let s = ok(joinRoom(started(), { id: 'sp', name: 'Oak', token: 'tsp' }));
    s = { ...s, players: s.players.map((p, i) => (i === 1 ? { ...p, place: 2 } : p)) };
    expect(canWatch(s, 'sp')).toBe(true);
    expect(canWatch(s, 'id1')).toBe(true);
    expect(canWatch(s, 'id0')).toBe(false);
  });

  it('seats spectators in the next game while there’s room, and lets them leave', () => {
    let s = ok(joinRoom(started(), { id: 'sp', name: 'Oak', token: 'tsp' }));
    s = ok(applyCommand(s, 'sp', { type: 'leave' }));
    expect(s.spectators).toEqual([]);
    s = ok(joinRoom(s, { id: 'sp2', name: 'Elm', token: 't2' }));
    s = { ...s, phase: 'over', players: s.players.map((p) => ({ ...p, place: 1 })) };
    s = ok(playAgain(s, 'id0'));
    expect(s.players.map((p) => p.name)).toEqual(['Ash', 'Misty', 'Elm']);
    expect(s.spectators).toEqual([]);
    expect(s.players[2]!.lives).toBe(2);
  });
});
