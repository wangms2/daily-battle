import { Battle, Dex, type PokemonSet } from '@pkmn/sim';
import { describe, expect, it } from 'vitest';
import { setsOf, speciesInfo } from './data';
import { finalStats, STAT_IDS } from './stats';

describe('final stats', () => {
  it('matches the simulator for every set of every Gen 4 species', () => {
    const dex = Dex.forGen(4);
    const battle = new Battle({ formatid: 'gen4ou' as never });
    let checked = 0;
    for (const entry of dex.species.all()) {
      const sets = setsOf(entry.name);
      if (!sets.length) continue;
      const base = speciesInfo(entry.name).baseStats;
      for (const set of sets) {
        const got = finalStats(base, set);
        // The simulator's own calculation, which the battle uses.
        const want = battle.spreadModify(entry.baseStats, {
          species: entry.name,
          nature: set.nature,
          evs: set.evs,
          ivs: set.ivs,
          level: 100,
        } as PokemonSet);
        for (const k of STAT_IDS) expect(got[k], `${entry.name} ${set.id} ${k}`).toBe(want[k]);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('gives Shedinja 1 HP and applies a nature', () => {
    const set = { nature: 'Adamant', evs: { atk: 252 }, ivs: {} } as never;
    expect(finalStats({ hp: 1, atk: 90, def: 45, spa: 30, spd: 30, spe: 40 }, set).hp).toBe(1);
    // 2*100 + 31 + 63 + 5 = 299, +10% = 328.
    expect(finalStats({ hp: 80, atk: 100, def: 80, spa: 80, spd: 80, spe: 80 }, set).atk).toBe(328);
  });
});
