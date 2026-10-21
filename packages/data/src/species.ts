// Species facts the web client needs (types, stats, tier) plus the Gen 4 type
// chart, so the UI never has to load the simulator's dex.
import { Dex } from '@pkmn/sim';
import type { SetsFile, StatID } from './types';

export interface SpeciesInfo {
  types: string[];
  baseStats: Record<StatID, number>;
  tier: string;
  /** National Dex number. */
  num: number;
}

export interface SpeciesFile {
  species: Record<string, SpeciesInfo>;
  /** typeChart[attacking][defending] = damage multiplier (Gen 4, 17 types). */
  typeChart: Record<string, Record<string, number>>;
}

export function buildSpecies(sets: SetsFile): SpeciesFile {
  const dex = Dex.forGen(4);
  const species: SpeciesFile['species'] = {};
  for (const name of Object.keys(sets.species)) {
    const s = dex.species.get(name);
    species[name] = {
      types: [...s.types],
      baseStats: { ...s.baseStats },
      tier: s.tier,
      num: s.num,
    };
  }
  const types = dex.types.names();
  const typeChart: SpeciesFile['typeChart'] = {};
  for (const attacking of types) {
    typeChart[attacking] = {};
    for (const defending of types) {
      typeChart[attacking]![defending] = !dex.getImmunity(attacking, [defending])
        ? 0
        : 2 ** dex.getEffectiveness(attacking, [defending]);
    }
  }
  return { species, typeChart };
}
