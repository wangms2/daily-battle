import { sets as defaultSets, type SetEntry, type SetsFile } from '@daily-battle/data';
import { Dex } from '@pkmn/sim';
import { CONFIG } from './config';

const dex = Dex.forGen(4);

export type Category = 'offense' | 'defense' | 'utility';

export interface SetTraits {
  sr: boolean;
  /** Spikes or Toxic Spikes. */
  spikes: boolean;
  /** Rapid Spin or Defog. */
  remover: boolean;
  categories: Set<Category>;
}

const UTILITY_MOVES = [
  'Stealth Rock',
  'Spikes',
  'Toxic Spikes',
  'Rapid Spin',
  'Defog',
  'Trick Room',
  'Reflect',
  'Light Screen',
  'Wish',
  'Trick',
  'Fake Out',
];

export function isBulky(set: SetEntry): boolean {
  return set.evs.hp >= 200 && (set.evs.def >= 160 || set.evs.spd >= 160);
}

export function setTraits(set: SetEntry): SetTraits {
  const has = (m: string) => set.moves.includes(m);
  const categories = new Set<Category>();
  const bulky = isBulky(set);
  if (bulky) categories.add('defense');
  if (!bulky && (set.evs.atk >= 200 || set.evs.spa >= 200)) categories.add('offense');
  if (UTILITY_MOVES.some(has)) categories.add('utility');
  return {
    sr: has('Stealth Rock'),
    spikes: has('Spikes') || has('Toxic Spikes'),
    remover: has('Rapid Spin') || has('Defog'),
    categories,
  };
}

/** Traits a species can bring: the union over its sets (the player picks any set). */
export function speciesTraits(entry: { sets: SetEntry[] }): SetTraits {
  const all = entry.sets.map(setTraits);
  return {
    sr: all.some((t) => t.sr),
    spikes: all.some((t) => t.spikes),
    remover: all.some((t) => t.remover),
    categories: new Set(all.flatMap((t) => [...t.categories])),
  };
}

const IMMUNITY_ABILITIES: Record<string, string> = {
  Levitate: 'Ground',
  'Flash Fire': 'Fire',
  'Water Absorb': 'Water',
  'Dry Skin': 'Water',
  'Volt Absorb': 'Electric',
  'Motor Drive': 'Electric',
};

/** True if the species resists or is immune to `type` (by typing, or the ability its sets use). */
export function checksType(species: string, entry: { sets: SetEntry[] }, type: string): boolean {
  if (entry.sets.some((s) => IMMUNITY_ABILITIES[s.ability] === type)) return true;
  const { types } = dex.species.get(species);
  return !dex.getImmunity(type, types) || dex.getEffectiveness(type, types) < 0;
}

/** Types of a set's damaging same-type (STAB) moves. */
export function stabTypes(species: string, set: SetEntry): string[] {
  const { types } = dex.species.get(species);
  const out = new Set<string>();
  for (const name of set.moves) {
    const move = dex.moves.get(name);
    if (move.category !== 'Status' && move.basePower > 0 && types.includes(move.type)) {
      out.add(move.type);
    }
  }
  return [...out];
}

/** Attacking types with at least `minShare` of usage-weighted STAB moves in the data. */
export function majorOffensiveTypes(
  data: SetsFile = defaultSets,
  minShare = CONFIG.majorTypeMinShare,
): string[] {
  const share = new Map<string, number>();
  let total = 0;
  for (const [species, entry] of Object.entries(data.species)) {
    for (const set of entry.sets) {
      for (const type of stabTypes(species, set)) {
        const w = entry.usage * set.weight;
        share.set(type, (share.get(type) ?? 0) + w);
        total += w;
      }
    }
  }
  return [...share]
    .filter(([, w]) => w / total >= minShare)
    .sort((a, b) => b[1] - a[1])
    .map(([type]) => type);
}
