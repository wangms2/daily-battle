import type { SetEntry, SetsFile } from '@daily-battle/data';
import type { PokemonSet } from '@pkmn/sim';

export interface TeamSlot {
  species: string;
  setId: string;
}

export function toPokemonSet(species: string, set: SetEntry): PokemonSet {
  return {
    name: species,
    species,
    item: set.item,
    ability: set.ability,
    nature: set.nature,
    evs: { ...set.evs },
    ivs: { ...set.ivs },
    moves: [...set.moves],
    level: 100,
    gender: '',
  };
}

export function findSet(data: SetsFile, slot: TeamSlot): SetEntry {
  const set = data.species[slot.species]?.sets.find((s) => s.id === slot.setId);
  if (!set) throw new Error(`Unknown set ${slot.species} / ${slot.setId}`);
  return set;
}

/** Full PokemonSets for a team of slots, ready for the validator or the sim. */
export function teamSets(data: SetsFile, team: TeamSlot[]): PokemonSet[] {
  return team.map((slot) => toPokemonSet(slot.species, findSet(data, slot)));
}
