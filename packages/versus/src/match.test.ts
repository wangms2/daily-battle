import { describe, expect, it } from 'vitest';
import {
  AI_ID,
  battleSlots,
  changeProblem,
  clockDeadline,
  leadFirst,
  matchView,
  newMatch,
  nextDeadline,
  PREP_MS,
  prepDone,
  startClock,
  stopClock,
  updatePrep,
  withChange,
  type Match,
  type Slot,
} from './match';
import { parseClientMessage } from './protocol';

const slots = (...names: string[]): Slot[] => names.map((species) => ({ species, setId: 'a' }));
const POOL = ['Heatran', 'Latias', 'Jirachi', 'Starmie', 'Tyranitar', 'Gyarados', 'Scizor'];

function match(now = 0, ai = false): Match {
  return newMatch({
    id: '1-0',
    players: { p1: 'a', p2: ai ? AI_ID : 'b' },
    names: { p1: 'Ash', p2: ai ? 'Rival' : 'Misty' },
    ai: ai ? 'p2' : null,
    format: 'gen4ou',
    seed: '1,2,3,4',
    slots: {
      p1: slots('Heatran', 'Latias', 'Jirachi'),
      p2: slots('Starmie', 'Tyranitar', 'Gyarados'),
    },
    bankMs: 240_000,
    now,
  });
}

describe('the swap', () => {
  it('allows one Pokémon from the pool, or another set, in one slot', () => {
    const team = slots('Heatran', 'Latias', 'Jirachi');
    expect(
      changeProblem(team, { slot: 1, to: { species: 'Scizor', setId: 'a' } }, POOL),
    ).toBeNull();
    expect(
      changeProblem(team, { slot: 1, to: { species: 'Latias', setId: 'b' } }, POOL),
    ).toBeNull();
    expect(changeProblem(team, { slot: 1, to: { species: 'Latias', setId: 'a' } }, POOL)).toBe(
      'no change',
    );
    expect(changeProblem(team, { slot: 1, to: { species: 'Jirachi', setId: 'a' } }, POOL)).toBe(
      'already on the team',
    );
    expect(changeProblem(team, { slot: 1, to: { species: 'Mew', setId: 'a' } }, POOL)).toBe(
      'not in the pool',
    );
    expect(changeProblem(team, { slot: 5, to: { species: 'Scizor', setId: 'a' } }, POOL)).toBe(
      'no such slot',
    );
    expect(
      withChange(team, { slot: 0, to: { species: 'Scizor', setId: 'a' } }).map((s) => s.species),
    ).toEqual(['Scizor', 'Latias', 'Jirachi']);
  });

  it('records the change and lead, and drops a lead the change swapped out', () => {
    let m = updatePrep(match(), 'p1', { lead: 'Latias' }, POOL)!;
    expect(m.prep.p1.lead).toBe('Latias');
    m = updatePrep(m, 'p1', { change: { slot: 1, to: { species: 'Scizor', setId: 'a' } } }, POOL)!;
    expect(m.prep.p1.lead).toBeNull();
    expect(updatePrep(m, 'p1', { lead: 'Latias' }, POOL)).toBeNull();
    m = updatePrep(m, 'p1', { lead: 'Scizor', ready: true }, POOL)!;
    expect(battleSlots(m, 'p1').map((s) => s.species)).toEqual(['Scizor', 'Heatran', 'Jirachi']);
    // The foe's view of the round shows none of it.
    const foe = matchView(m, 'p2', 0, 60_000);
    expect(foe.foeSpecies).toEqual(['Heatran', 'Latias', 'Jirachi']);
    expect(foe.foeReady).toBe(true);
    expect(JSON.stringify(foe)).not.toContain('Scizor');
  });

  it('is done when both are ready, or at the deadline', () => {
    const m = updatePrep(match(), 'p1', { ready: true }, POOL)!;
    expect(prepDone(m, 1000)).toBe(false);
    expect(prepDone(m, PREP_MS)).toBe(true);
    expect(prepDone(updatePrep(m, 'p2', { ready: true }, POOL)!, 1000)).toBe(true);
  });

  it('has the AI ready from the start, leading with its first Pokémon', () => {
    const m = match(0, true);
    expect(m.prep.p2).toEqual({ change: null, lead: 'Starmie', ready: true });
    expect(updatePrep(m, 'p2', { lead: 'Gyarados' }, POOL)).toBeNull();
    expect(matchView(m, 'p1', 0, 60_000).opponent).toEqual({ id: AI_ID, name: 'Rival', ai: true });
  });

  it('sends the lead first, the rest in order', () => {
    const t = slots('A', 'B', 'C', 'D');
    expect(leadFirst(t, 'C').map((s) => s.species)).toEqual(['C', 'A', 'B', 'D']);
    expect(leadFirst(t, null).map((s) => s.species)).toEqual(['A', 'B', 'C', 'D']);
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
    expect(nextDeadline(m, 60_000)).toBe(PREP_MS);
    const battling: Match = {
      ...m,
      stage: 'battle',
      clocks: { p1: { bankMs: 240_000, since: 5000 }, p2: { bankMs: 30_000, since: 5000 } },
    };
    expect(nextDeadline(battling, 60_000)).toBe(35_000);
    expect(nextDeadline({ ...battling, stage: 'over' }, 60_000)).toBeNull();
  });
});

describe('matchView', () => {
  it('reports the result your way', () => {
    const m: Match = { ...match(), stage: 'over', result: { winner: 'p1', reason: 'timeout' } };
    const view = matchView(m, 'p2', 0, 60_000);
    expect(view.result).toEqual({ winner: 'foe', reason: 'timeout' });
    expect(view.timeLeftMs).toBeNull();
    expect(JSON.stringify(view)).not.toContain('1,2,3,4');
  });
});

describe('game messages', () => {
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
  });

  it('accepts teams, changes, and leads in shape', () => {
    const slot = { species: 'Heatran', setId: 'scarf' };
    expect(parse({ type: 'team', team: [slot, slot] })).toEqual({
      type: 'team',
      team: [slot, slot],
    });
    expect(parse({ type: 'team', team: [] })).toBeNull();
    expect(parse({ type: 'team', team: [{ species: 'Heatran' }] })).toBeNull();
    expect(parse({ type: 'change', change: { slot: 2, to: slot } })).toEqual({
      type: 'change',
      change: { slot: 2, to: slot },
    });
    expect(parse({ type: 'change', change: null })).toEqual({ type: 'change', change: null });
    expect(parse({ type: 'change', change: { slot: 7, to: slot } })).toBeNull();
    expect(parse({ type: 'lead', species: 'Heatran' })).toEqual({
      type: 'lead',
      species: 'Heatran',
    });
    expect(parse({ type: 'ready', extra: 1 })).toEqual({ type: 'ready' });
  });
});
