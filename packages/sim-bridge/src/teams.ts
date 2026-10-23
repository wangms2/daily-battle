import { sets as defaultSets, type SetEntry, type SetsFile } from '@daily-battle/data';
import { TeamValidator, type PokemonSet } from '@pkmn/sim';
import type { Rng } from './rng';

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

function weightedPick<T extends { weight: number }>(items: T[], rng: Rng): T {
  let r = rng() * items.reduce((a, x) => a + x.weight, 0);
  for (const item of items) {
    r -= item.weight;
    if (r < 0) return item;
  }
  return items[items.length - 1]!;
}

/**
 * A random legal team from the set snapshot: 6 distinct species (uniform),
 * each with a set drawn by weight. Redraws if the validator rejects the team.
 */
export function randomTeam(rng: Rng, data: SetsFile = defaultSets): PokemonSet[] {
  const validator = TeamValidator.get(data.meta.format);
  const names = Object.keys(data.species);
  for (let attempt = 0; attempt < 100; attempt++) {
    const pool = [...names];
    const team: PokemonSet[] = [];
    for (let i = 0; i < 6; i++) {
      const name = pool.splice(Math.floor(rng() * pool.length), 1)[0]!;
      team.push(toPokemonSet(name, weightedPick(data.species[name]!.sets, rng)));
    }
    if (!validator.validateTeam(structuredClone(team))) return team;
  }
  throw new Error('Could not draw a legal team in 100 attempts');
}
