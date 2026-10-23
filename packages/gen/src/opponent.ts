import { sets as defaultSets, type SetEntry, type SetsFile } from '@daily-battle/data';
import { TeamValidator } from '@pkmn/sim';
import { CONFIG, GENERATOR_VERSION, seedPrefix } from './config';
import { candidateKey, rngFor, weightedSample } from './rng';
import { findSet, teamSets, type TeamSlot } from './sets';
import { setTraits } from './traits';

export type Style = 'offense' | 'balance' | 'stall';

export interface DailyOpponent {
  generatorVersion: number;
  day: string;
  /** Picks the AI's parameter preset (DESIGN.md §8.5). Never shown to the player. */
  style: Style;
  team: TeamSlot[];
  /** Rejection-sampling attempts it took (for diagnostics). */
  attempts: number;
}

export function styleOf(sets: SetEntry[]): Style {
  const traits = sets.map(setTraits);
  const defense = traits.filter((t) => t.categories.has('defense')).length;
  const offense = traits.filter((t) => t.categories.has('offense')).length;
  if (defense >= CONFIG.opponent.stallMinDefense) return 'stall';
  if (defense === 0 && offense >= CONFIG.opponent.offenseMinOffense) return 'offense';
  return 'balance';
}

/** Why a candidate team fails the hard constraints, or [] if it passes. */
export function opponentProblems(team: TeamSlot[], data: SetsFile = defaultSets): string[] {
  const problems: string[] = [];
  const traits = team.map((slot) => setTraits(findSet(data, slot)));
  if (new Set(team.map((s) => s.species)).size !== team.length) problems.push('duplicate species');
  if (traits.filter((t) => t.sr || t.spikes).length > CONFIG.opponent.maxHazardSetters) {
    problems.push('too many hazard setters');
  }
  if (!traits.some((t) => t.categories.has('offense'))) problems.push('no offensive set');
  if (traits.every((t) => t.categories.has('offense') && t.categories.size === 1)) {
    problems.push('no non-offensive set');
  }
  const invalid = TeamValidator.get(data.meta.format).validateTeam(teamSets(data, team));
  if (invalid) problems.push(`illegal: ${invalid.join(' ')}`);
  return problems;
}

function pickSet(sets: SetEntry[], r: number): SetEntry {
  for (const set of sets) {
    r -= set.weight;
    if (r < 0) return set;
  }
  return sets[sets.length - 1]!;
}

/** The daily opponent for a day: 6 species with hidden sets (DESIGN.md §6.3). */
export function generateOpponent(
  day: string,
  data: SetsFile = defaultSets,
  /** Alternative draws for the same day, used when validation rejects one (M5). */
  candidate = 0,
): DailyOpponent {
  const rng = rngFor(
    candidateKey(`${seedPrefix(data.meta.format)}gen${GENERATOR_VERSION}:day:${day}`, candidate),
  );
  const names = Object.keys(data.species);
  const weight = (s: string) => data.species[s]!.usage ** CONFIG.usageExponent;
  for (let attempts = 1; attempts <= CONFIG.maxAttempts; attempts++) {
    const species = weightedSample(names, weight, CONFIG.opponent.size, rng);
    const team = species.map((s) => ({
      species: s,
      setId: pickSet(data.species[s]!.sets, rng()).id,
    }));
    if (opponentProblems(team, data).length) continue;
    const hasRemover = team.some((slot) => setTraits(findSet(data, slot)).remover);
    // Soft constraint: a remover is likely, not required.
    if (!hasRemover && rng() >= CONFIG.opponent.acceptWithoutRemover) continue;
    const style = styleOf(team.map((slot) => findSet(data, slot)));
    return { generatorVersion: GENERATOR_VERSION, day, style, team, attempts };
  }
  throw new Error(`No valid opponent for ${day} in ${CONFIG.maxAttempts} attempts`);
}
