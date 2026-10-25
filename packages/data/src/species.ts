// Species facts the web client needs (types, stats, tier), the moves the sets
// use, and the type chart, so the UI never has to load the simulator's dex.
import { Dex } from '@pkmn/sim';
import { genOf } from './formats';
import { megaForm, megaName } from './roles';
import type { SetsFile, StatID } from './types';

/** A Mega form one of the species' sets can become (Gen 6 on). */
export interface MegaInfo {
  /** The sim's forme name, e.g. `Charizard-Mega-X`. */
  forme: string;
  /** The games' name, e.g. `Mega Charizard X`. */
  name: string;
  /** The Mega Stone that makes it. */
  stone: string;
  types: string[];
  baseStats: Record<StatID, number>;
  ability: string;
  tier: string;
}

export interface SpeciesInfo {
  types: string[];
  baseStats: Record<StatID, number>;
  /** The sets file's tier: from Gen 6, the higher of its own and its Megas'. */
  tier: string;
  /** National Dex number. */
  num: number;
  /** Every ability the species can have in this generation (hidden ones from Gen 5). */
  abilities: string[];
  /** Megas its sets can become, by stone. Only present when it has some. */
  megas?: Record<string, MegaInfo>;
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
  /** Every item a set holds: one line on what it does, in the format's generation. */
  items: Record<string, string>;
  /** Every ability a set has: one line on what it does. */
  abilities: Record<string, string>;
  /** typeChart[attacking][defending] = damage multiplier (17 types through Gen 5, 18 with Fairy from Gen 6). */
  typeChart: Record<string, Record<string, number>>;
}

export function buildSpecies(sets: SetsFile): SpeciesFile {
  const dex = Dex.forGen(genOf(sets.meta.format));
  const species: SpeciesFile['species'] = {};
  const megaAbilities: string[] = [];
  for (const [name, entry] of Object.entries(sets.species)) {
    const s = dex.species.get(name);
    const info: SpeciesInfo = {
      types: [...s.types],
      baseStats: { ...s.baseStats },
      tier: entry.tier,
      num: s.num,
      abilities: Object.values(s.abilities),
    };
    const megas: Record<string, MegaInfo> = {};
    for (const set of entry.sets) {
      const forme = megaForm(name, set.item, dex);
      if (!forme || megas[set.item]) continue;
      const m = dex.species.get(forme);
      megas[set.item] = {
        forme: m.name,
        name: megaName(m.name),
        stone: set.item,
        types: [...m.types],
        baseStats: { ...m.baseStats },
        ability: m.abilities[0],
        tier: m.tier,
      };
      megaAbilities.push(m.abilities[0]);
    }
    if (Object.keys(megas).length) info.megas = megas;
    species[name] = info;
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
  const all = Object.values(sets.species).flatMap((e) => e.sets);
  const describe = (kind: 'items' | 'abilities', names: string[]) => {
    const out: Record<string, string> = {};
    for (const name of [...new Set(names.filter(Boolean))].sort()) {
      const e = dex[kind].get(name);
      if (!e.exists) throw new Error(`Unknown ${kind} in sets: ${name}`);
      out[name] = e.shortDesc || e.desc;
    }
    return out;
  };
  const items = describe(
    'items',
    all.map((s) => s.item),
  );
  const abilities = describe('abilities', [...all.map((s) => s.ability), ...megaAbilities]);
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
  return { species, moves, items, abilities, typeChart };
}
