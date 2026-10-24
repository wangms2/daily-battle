import { sets as defaultSets, type SetEntry, type SetsFile } from '@daily-battle/data';
import { oneMegaProblem } from '@daily-battle/data/species';
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
 * The format's validator plus our own team rules (one Mega per team, from
 * Gen 6). Returns the problems, or null if the team is legal.
 */
export function teamProblems(format: string, team: PokemonSet[]): string[] | null {
  const problems = [
    ...(TeamValidator.get(format).validateTeam(structuredClone(team)) ?? []),
    ...[oneMegaProblem(format, team)].filter((p): p is string => !!p),
  ];
  return problems.length ? problems : null;
}

/**
 * A random legal team from the set snapshot: 6 distinct species (uniform),
 * each with a set drawn by weight. Redraws if the validator or our own team
 * rules (one Mega) reject the team.
 */
export function randomTeam(rng: Rng, data: SetsFile = defaultSets): PokemonSet[] {
  const format = data.meta.format;
  const names = Object.keys(data.species);
  for (let attempt = 0; attempt < 100; attempt++) {
    const pool = [...names];
    const team: PokemonSet[] = [];
    for (let i = 0; i < 6; i++) {
      const name = pool.splice(Math.floor(rng() * pool.length), 1)[0]!;
      team.push(toPokemonSet(name, weightedPick(data.species[name]!.sets, rng)));
    }
    if (!teamProblems(format, team)) return team;
  }
  throw new Error('Could not draw a legal team in 100 attempts');
}
