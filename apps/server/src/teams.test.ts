import { setsFor } from '@daily-battle/data';
import { describe, expect, it } from 'vitest';
import { aiTeam, autoTeam, legalTeam, randomPool } from './teams';

describe('pools and teams', () => {
  it('draws a pool of 12 per room and draw, the same each time', () => {
    for (const format of ['gen4ou', 'gen5ou']) {
      const a = randomPool(format, 'BCDFG', 0);
      expect(a.species).toHaveLength(12);
      expect(randomPool(format, 'BCDFG', 0).species).toEqual(a.species);
      expect(randomPool(format, 'BCDFG', 1).species).not.toEqual(a.species);
      // Each player's own 12: the same each time, and not the same as another's.
      const mine = randomPool(format, 'BCDFG', 0, 'p1').species;
      expect(randomPool(format, 'BCDFG', 0, 'p1').species).toEqual(mine);
      expect(randomPool(format, 'BCDFG', 0, 'p2').species).not.toEqual(mine);
    }
  });

  it('checks built teams against the set data and the validator', () => {
    const data = setsFor('gen4ou');
    const [a, b] = Object.keys(data.species);
    const slot = (s: string) => ({ species: s, setId: data.species[s]!.sets[0]!.id });
    expect(legalTeam('gen4ou', [slot(a!), slot(b!)])).toHaveLength(2);
    expect(legalTeam('gen4ou', [{ species: a!, setId: 'nope' }])).toBeNull();
    expect(legalTeam('gen4ou', [slot(a!), slot(a!)])).toBeNull(); // Species Clause
  });

  it('allows one Mega per team in Gen 6', () => {
    const data = setsFor('gen6ou');
    const megaSet = (s: string) =>
      data.species[s]!.sets.find((set) => /ite( [XY])?$/.test(set.item) && set.item !== 'Eviolite');
    const [a, b] = ['Charizard', 'Metagross'].map((s) => ({ species: s, setId: megaSet(s)!.id }));
    expect(legalTeam('gen6ou', [a!])).not.toBeNull();
    expect(legalTeam('gen6ou', [a!, b!])).toBeNull();
  });

  it('gives a late builder a legal team of their size from the pool', () => {
    const pool = randomPool('gen5ou', 'BCDFG', 2).species;
    for (const size of [6, 3]) {
      const team = autoTeam('gen5ou', pool, size);
      expect(team).toHaveLength(size);
      expect(team.every((s) => pool.includes(s.species))).toBe(true);
      expect(legalTeam('gen5ou', team)).not.toBeNull();
    }
  });

  it('deals the AI a team at its foe’s size, the same for the same round', () => {
    const ai = aiTeam('gen4ou', 'room:BCDFG:2:1', 4);
    expect(ai.slots).toHaveLength(4);
    expect(['offense', 'balance', 'stall']).toContain(ai.style);
    expect(aiTeam('gen4ou', 'room:BCDFG:2:1', 4)).toEqual(ai);
  });
});
