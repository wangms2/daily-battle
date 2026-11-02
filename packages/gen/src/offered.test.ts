import { playerSets, setsFor } from '@daily-battle/data';
import { describe, expect, it } from 'vitest';
import { MAX_OFFERED_SETS, offeredSets } from './offered';

const data = setsFor('gen4ou');
const top = (species: string) =>
  data.species[species]!.sets.reduce((a, b) => (b.weight > a.weight ? b : a));

describe('offeredSets', () => {
  it('offers at most three sets, always the most used and the fun set', () => {
    for (const species of Object.keys(data.species)) {
      const all = playerSets(data.species[species]);
      const offered = offeredSets(data, species, '2026-11-09');
      expect(offered.length, species).toBe(Math.min(all.length, MAX_OFFERED_SETS));
      expect(offered, species).toContain(top(species));
      const fun = data.species[species]!.fun;
      if (fun) expect(offered.at(-1), species).toBe(fun);
    }
  });

  it('is the same for the same week, and varies from week to week', () => {
    // Clefable has four standard sets and a fun set.
    expect(playerSets(data.species['Clefable'])).toHaveLength(5);
    const ids = (week: string) => offeredSets(data, 'Clefable', week).map((s) => s.id);
    expect(ids('2026-11-09')).toEqual(ids('2026-11-09'));
    const weeks = Array.from({ length: 12 }, (_, i) => `2027-01-${String(i + 1).padStart(2, '0')}`);
    expect(new Set(weeks.map((w) => ids(w).join())).size).toBeGreaterThan(1);
  });

  it("keeps a player's current set on offer", () => {
    for (const set of data.species['Clefable']!.sets) {
      expect(offeredSets(data, 'Clefable', '2026-11-09', set.id)).toContain(set);
    }
  });
});
