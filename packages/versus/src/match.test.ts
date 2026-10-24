import type { PokemonSet } from '@pkmn/sim';
import { describe, expect, it } from 'vitest';
import {
  chooseLead,
  clockDeadline,
  leadFirst,
  leadsReady,
  LEAD_MS,
  matchView,
  newMatch,
  nextDeadline,
  pairUp,
  startClock,
  stopClock,
  type Match,
} from './match';
import { parseClientMessage } from './protocol';
import { createRoom, putMatch, startRound } from './room';

const set = (species: string) => ({ species, moves: ['Tackle'] }) as unknown as PokemonSet;
const team = (...names: string[]) => names.map(set);

function match(now = 0): Match {
  return newMatch({
    id: '1-0',
    players: { p1: 'a', p2: 'b' },
    names: { p1: 'Ash', p2: 'Misty' },
    format: 'gen4ou',
    seed: '1,2,3,4',
    teams: {
      p1: team('Heatran', 'Latias', 'Jirachi'),
      p2: team('Starmie', 'Tyranitar', 'Gyarados'),
    },
    bankMs: 240_000,
    now,
  });
}

describe('leads', () => {
  it('picks a lead from your own team, and waits for both or the deadline', () => {
    const m = chooseLead(match(), 'p1', 'Latias')!;
    expect(m.leads).toEqual({ p1: 'Latias' });
    expect(chooseLead(m, 'p1', 'Starmie')).toBeNull();
    expect(leadsReady(m, 1000)).toBe(false);
    expect(leadsReady(m, LEAD_MS)).toBe(true);
    expect(leadsReady(chooseLead(m, 'p2', 'Gyarados')!, 1000)).toBe(true);
  });

  it('sends the lead first, the rest in order', () => {
    const t = team('A', 'B', 'C', 'D');
    expect(leadFirst(t, 'C').map((s) => s.species)).toEqual(['C', 'A', 'B', 'D']);
    expect(leadFirst(t, undefined).map((s) => s.species)).toEqual(['A', 'B', 'C', 'D']);
  });
});

describe('clocks', () => {
  it('runs while it’s your turn, capped per turn, and charges the bank', () => {
    let c = startClock({ bankMs: 100_000, since: null }, 1000);
    expect(clockDeadline(c, 60_000)).toBe(61_000);
    c = stopClock(c, 21_000);
    expect(c).toEqual({ bankMs: 80_000, since: null });
    expect(clockDeadline(c, 60_000)).toBeNull();
    // Less in the bank than a turn's cap: the bank is the limit.
    c = startClock({ bankMs: 10_000, since: null }, 0);
    expect(clockDeadline(c, 60_000)).toBe(10_000);
  });

  it('finds the next deadline in a match', () => {
    const m = match(0);
    expect(nextDeadline(m, 60_000)).toBe(LEAD_MS);
    const battling: Match = {
      ...m,
      stage: 'battle',
      clocks: { p1: { bankMs: 240_000, since: 5000 }, p2: { bankMs: 30_000, since: 5000 } },
    };
    expect(nextDeadline(battling, 60_000)).toBe(35_000);
    expect(nextDeadline({ ...battling, stage: 'over' }, 60_000)).toBeNull();
  });
});

describe('pairUp', () => {
  it('pairs everyone, with one out on an odd count', () => {
    let n = 0;
    const random = () => (n++ * 0.618) % 1;
    const { pairs, sittingOut } = pairUp(['a', 'b', 'c', 'd', 'e'], random);
    expect(pairs).toHaveLength(2);
    const seen = [...pairs.flat(), sittingOut];
    expect([...seen].sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(pairUp(['a', 'b'], random).sittingOut).toBeNull();
  });
});

describe('matchView', () => {
  it('shows your team and only the foe’s species', () => {
    const view = matchView(match(), 'p2', 1000, 60_000);
    expect(view.team.map((s) => s.species)).toEqual(['Starmie', 'Tyranitar', 'Gyarados']);
    expect(view.foeSpecies).toEqual(['Heatran', 'Latias', 'Jirachi']);
    expect(view.opponent).toEqual({ id: 'a', name: 'Ash' });
    expect(view.timeLeftMs).toBe(LEAD_MS - 1000);
    expect(JSON.stringify(view)).not.toContain('Tackle"],"species":"Heatran');
    expect(JSON.stringify(view)).not.toContain('1,2,3,4');
  });

  it('puts your lead first once the battle starts, and reports the result your way', () => {
    const m: Match = {
      ...chooseLead(match(), 'p2', 'Gyarados')!,
      stage: 'over',
      result: { winner: 'p1', reason: 'timeout' },
    };
    const view = matchView(m, 'p2', 0, 60_000);
    expect(view.team[0]!.species).toBe('Gyarados');
    expect(view.result).toEqual({ winner: 'foe', reason: 'timeout' });
    expect(view.timeLeftMs).toBeNull();
  });
});

describe('rounds', () => {
  it('returns to the lobby with a summary once every battle is over', () => {
    let room = startRound(createRoom('BCDFG', 0), [match(), { ...match(), id: '1-1' }], 'c');
    expect(room.phase).toBe('playing');
    expect(room.round).toBe(1);
    room = putMatch(room, { ...match(), stage: 'over', result: { winner: 'p2', reason: 'win' } });
    expect(room.phase).toBe('playing');
    room = putMatch(room, {
      ...match(),
      id: '1-1',
      stage: 'over',
      result: { winner: null, reason: 'tie' },
    });
    expect(room.phase).toBe('lobby');
    expect(room.matches).toEqual([]);
    expect(room.lastRound?.matches.map((m) => m.winner)).toEqual(['p2', null]);
    expect(room.lastRound?.sittingOut).toBe('c');
  });
});

describe('battle messages', () => {
  const parse = (v: unknown) => parseClientMessage(JSON.stringify(v));
  it('accepts singles choices only', () => {
    expect(parse({ type: 'choose', choice: 'move 4' })).toEqual({
      type: 'choose',
      choice: 'move 4',
    });
    expect(parse({ type: 'choose', choice: 'switch 6' })).not.toBeNull();
    expect(parse({ type: 'choose', choice: 'move 5' })).toBeNull();
    expect(parse({ type: 'choose', choice: 'team 123456' })).toBeNull();
    expect(parse({ type: 'choose', choice: 'move 1, move 2' })).toBeNull();
    expect(parse({ type: 'lead', species: 'Heatran' })).toEqual({
      type: 'lead',
      species: 'Heatran',
    });
  });
});
