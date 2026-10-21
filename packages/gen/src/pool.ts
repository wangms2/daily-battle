import { sets as defaultSets, type SetsFile } from '@daily-battle/data';
import { TeamValidator } from '@pkmn/sim';
import { CONFIG, GENERATOR_VERSION } from './config';
import { rngFor, weightedSample } from './rng';
import { toPokemonSet } from './sets';
import { checksType, majorOffensiveTypes, speciesTraits } from './traits';

export interface WeeklyPool {
  generatorVersion: number;
  /** Monday of the week, `YYYY-MM-DD`. */
  week: string;
  species: string[];
  /** Rejection-sampling attempts it took (for diagnostics). */
  attempts: number;
}

/** Why a candidate pool fails the hard constraints, or [] if it passes. */
export function poolProblems(species: string[], data: SetsFile = defaultSets): string[] {
  const { pool } = CONFIG;
  const problems: string[] = [];
  const ranked = Object.keys(data.species).sort(
    (a, b) => data.species[b]!.usage - data.species[a]!.usage,
  );
  const topTier = new Set(ranked.slice(0, pool.topTierSize));
  const traits = species.map((s) => speciesTraits(data.species[s]!));
  const count = (pred: (t: (typeof traits)[number]) => boolean) => traits.filter(pred).length;

  if (new Set(species).size !== species.length) problems.push('duplicate species');
  if (species.filter((s) => topTier.has(s)).length > pool.topTierMax)
    problems.push('too many top-tier species');
  if (!count((t) => t.sr)) problems.push('no Stealth Rock setter');
  if (!count((t) => t.spikes)) problems.push('no Spikes or Toxic Spikes setter');
  if (!count((t) => t.remover)) problems.push('no hazard remover');
  if (count((t) => t.categories.has('offense')) < pool.minOffense)
    problems.push('too few offensive');
  if (count((t) => t.categories.has('defense')) < pool.minDefense)
    problems.push('too few defensive');
  if (count((t) => t.categories.has('utility')) < pool.minUtility) problems.push('too few utility');
  for (const type of majorOffensiveTypes(data)) {
    if (!species.some((s) => checksType(s, data.species[s]!, type)))
      problems.push(`no ${type} check`);
  }
  if (!problems.length) {
    // A legal team must exist: the six most-used species with their top sets.
    const team = [...species]
      .sort((a, b) => data.species[b]!.usage - data.species[a]!.usage)
      .slice(0, 6)
      .map((s) => toPokemonSet(s, data.species[s]!.sets[0]!));
    if (TeamValidator.get(CONFIG.format).validateTeam(team)) problems.push('no legal team');
  }
  return problems;
}

/** The weekly pool of 12 species for a week (DESIGN.md §6.2). */
export function generatePool(week: string, data: SetsFile = defaultSets): WeeklyPool {
  const rng = rngFor(`gen${GENERATOR_VERSION}:week:${week}`);
  const names = Object.keys(data.species);
  const weight = (s: string) => data.species[s]!.usage ** CONFIG.usageExponent;
  for (let attempts = 1; attempts <= CONFIG.maxAttempts; attempts++) {
    const species = weightedSample(names, weight, CONFIG.pool.size, rng);
    if (!poolProblems(species, data).length) {
      return { generatorVersion: GENERATOR_VERSION, week, species, attempts };
    }
  }
  throw new Error(`No valid pool for ${week} in ${CONFIG.maxAttempts} attempts`);
}
