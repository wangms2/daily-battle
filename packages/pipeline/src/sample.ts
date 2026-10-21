import { sets as defaultSets, type SetEntry, type SetsFile } from '@daily-battle/data';
import { teamSets, toPokemonSet, type Rng, type TeamSlot } from '@daily-battle/gen';
import { TeamValidator, type PokemonSet } from '@pkmn/sim';
import type { KnownSets } from '@daily-battle/ai';

function pickSet(sets: SetEntry[], rng: Rng): SetEntry {
  let r = rng();
  for (const s of sets) if ((r -= s.weight) < 0) return s;
  return sets[sets.length - 1]!;
}

/**
 * `n` legal teams of 6 drawn from a pool, with sets by weight, the way a
 * player might build them. Deterministic for a given rng.
 */
export function poolTeams(
  species: string[],
  n: number,
  rng: Rng,
  data: SetsFile = defaultSets,
): TeamSlot[][] {
  const validator = TeamValidator.get('gen4ou');
  const teams: TeamSlot[][] = [];
  for (let guard = 0; teams.length < n && guard < n * 50; guard++) {
    const left = [...species];
    const team: TeamSlot[] = [];
    for (let k = 0; k < 6; k++) {
      const name = left.splice(Math.floor(rng() * left.length), 1)[0]!;
      team.push({ species: name, setId: pickSet(data.species[name]!.sets, rng).id });
    }
    if (!validator.validateTeam(teamSets(data, team))) teams.push(team);
  }
  if (teams.length < n) throw new Error(`Could only draw ${teams.length} legal teams`);
  return teams;
}

/** Known sets (for the informed bot) from PokemonSets, matched to the data where possible. */
export function knownSetsOf(team: PokemonSet[], data: SetsFile = defaultSets): KnownSets {
  const known: KnownSets = {};
  for (const p of team) {
    const match = data.species[p.species]?.sets.find(
      (s) => s.item === p.item && s.moves.join() === p.moves.join(),
    );
    known[p.species] = match ?? {
      id: `${p.species.toLowerCase()}-custom`,
      sourceName: 'Custom',
      label: 'Custom',
      description: '',
      weight: 1,
      moves: [...p.moves],
      item: p.item,
      ability: p.ability,
      nature: p.nature,
      evs: { ...p.evs },
      ivs: { ...p.ivs },
    };
  }
  return known;
}

export { toPokemonSet };
