// Species facts the web client needs (types, stats, tier), the moves the sets
// use, and the type chart, so the UI never has to load the simulator's dex.
import { Dex } from '@pkmn/sim';
import { genOf } from './formats';
import type { SetsFile, StatID } from './types';

export interface SpeciesInfo {
  types: string[];
  baseStats: Record<StatID, number>;
  tier: string;
  /** National Dex number. */
  num: number;
}

/** What a move does, for the team builder's move details. */
export interface MoveInfo {
  type: string;
  category: 'Physical' | 'Special' | 'Status';
  /** 0 for status moves and moves without a fixed power. */
  power: number;
  /** true: never misses. */
  accuracy: number | true;
  pp: number;
  priority: number;
  contact: boolean;
  /** One line on what it does. */
  desc: string;
}

export interface SpeciesFile {
  species: Record<string, SpeciesInfo>;
  /** Every move a set uses, by name as the sets spell it. */
  moves: Record<string, MoveInfo>;
  /** typeChart[attacking][defending] = damage multiplier (17 types through Gen 5). */
  typeChart: Record<string, Record<string, number>>;
}

export function buildSpecies(sets: SetsFile): SpeciesFile {
  const dex = Dex.forGen(genOf(sets.meta.format));
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
  const moves: SpeciesFile['moves'] = {};
  for (const name of [
    ...new Set(Object.values(sets.species).flatMap((e) => e.sets.flatMap((s) => s.moves))),
  ].sort()) {
    const m = dex.moves.get(name);
    if (!m.exists) throw new Error(`Unknown move in sets: ${name}`);
    // Typed Hidden Powers ("Hidden Power Fighting") have no text of their own.
    const text = m.shortDesc || m.desc ? m : dex.moves.get('hiddenpower');
    moves[name] = {
      type: m.type,
      category: m.category,
      power: m.basePower,
      accuracy: m.accuracy,
      pp: m.pp,
      priority: m.priority,
      contact: !!m.flags.contact,
      desc:
        text === m ? m.shortDesc || m.desc : `Type set by the user's IVs: ${m.type} on this set.`,
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
  return { species, moves, typeChart };
}
