import { sets as defaultSets, genOf, type SetsFile } from '@daily-battle/data';
import { TeamValidator } from '@pkmn/sim';
import { CONFIG, GENERATOR_VERSION, OU_TIERS, seedPrefix } from './config';
import { candidateKey, rngFor, weightedSample } from './rng';
import { toPokemonSet } from './sets';
import { checksType, isMegaSet, majorOffensiveTypes, speciesTraits } from './traits';

export interface WeeklyPool {
  generatorVersion: number;
  /** Monday of the week, `YYYY-MM-DD`. */
  week: string;
  species: string[];
  /** Rejection-sampling attempts it took (for diagnostics). */
  attempts: number;
}

export const isBelowOu = (data: SetsFile, species: string) =>
  !OU_TIERS.includes(data.species[species]!.tier);

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
  const belowOu = species.filter((s) => isBelowOu(data, s)).length;

  if (new Set(species).size !== species.length) problems.push('duplicate species');
  if (species.filter((s) => topTier.has(s)).length > pool.topTierMax) {
    problems.push('too many top-tier species');
  }
  if (belowOu < pool.belowOuMin || belowOu > pool.belowOuMax) {
    problems.push(`${belowOu} below-OU species`);
  }
  if (!count((t) => t.sr)) problems.push('no Stealth Rock setter');
  if (count((t) => t.categories.has('offense')) < pool.minOffense) {
    problems.push('too few offensive');
  }
  if (count((t) => t.categories.has('defense')) < pool.minDefense) {
    problems.push('too few defensive');
  }
  if (count((t) => t.categories.has('utility')) < pool.minUtility) problems.push('too few utility');
  const gen = genOf(data.meta.format);
  if (gen >= 6) {
    // Every Gen 6 pool offers a Mega; one per team, so at least five others must not need one.
    const sets = (s: string) => data.species[s]!.sets;
    if (!species.some((s) => sets(s).some((set) => isMegaSet(s, set, gen)))) {
      problems.push('no Mega species');
    }
    const megaOnly = species.filter((s) => sets(s).every((set) => isMegaSet(s, set, gen)));
    if (species.length - megaOnly.length < 5) problems.push('too many Mega-only species');
  }
  for (const type of majorOffensiveTypes(data)) {
    if (!species.some((s) => checksType(s, data.species[s]!, type, gen))) {
      problems.push(`no ${type} check`);
    }
  }
  if (!problems.length) {
    // A legal team must exist: the six most-used species with their top sets.
    // From Gen 6, each species brings its top set without a Mega Stone where it has one,
    // and the team keeps the first Mega it meets (one Mega per team).
    let mega = false;
    const team = [...species]
      .sort((a, b) => data.species[b]!.usage - data.species[a]!.usage)
      .flatMap((s) => {
        const sets = data.species[s]!.sets;
        const set = mega ? sets.find((x) => !isMegaSet(s, x, gen)) : sets[0]!;
        if (!set) return [];
        mega ||= isMegaSet(s, set, gen);
        return [toPokemonSet(s, set)];
      })
      .slice(0, 6);
    if (TeamValidator.get(data.meta.format).validateTeam(team)) problems.push('no legal team');
  }
  return problems;
}

/**
 * The weekly pool of 12 species for a week (DESIGN.md §6.2). A quota of
 * below-OU species is drawn separately (by their own usage) so they show up
 * despite low usage overall. Stealth Rock is required. Each week decides up
 * front whether it gets a Spikes/Toxic Spikes setter, so about `spikesRate`
 * of pools do. A pool without a hazard remover is accepted only part of the time.
 */
export function generatePool(
  week: string,
  data: SetsFile = defaultSets,
  /** Alternative draws for the same week, used when validation rejects one (M5). */
  candidate = 0,
): WeeklyPool {
  const { pool } = CONFIG;
  const rng = rngFor(
    candidateKey(`${seedPrefix(data.meta.format)}gen${GENERATOR_VERSION}:week:${week}`, candidate),
  );
  const names = Object.keys(data.species);
  const ou = names.filter((s) => !isBelowOu(data, s));
  const belowOu = names.filter((s) => isBelowOu(data, s));
  const ouWeight = (s: string) => data.species[s]!.usage ** CONFIG.usageExponent;
  const belowOuWeight = (s: string) => data.species[s]!.usage ** pool.belowOuUsageExponent;
  const wantSpikes = rng() < pool.spikesRate;

  for (let attempts = 1; attempts <= CONFIG.maxAttempts; attempts++) {
    const quota = pool.belowOuMin + Math.floor(rng() * (pool.belowOuMax - pool.belowOuMin + 1));
    const species = [
      ...weightedSample(ou, ouWeight, pool.size - quota, rng),
      ...weightedSample(belowOu, belowOuWeight, quota, rng),
    ];
    if (poolProblems(species, data).length) continue;
    const traits = species.map((s) => speciesTraits(data.species[s]!));
    if (traits.some((t) => t.spikes) !== wantSpikes) continue;
    if (!traits.some((t) => t.remover) && rng() >= pool.acceptWithoutRemover) continue;
    return { generatorVersion: GENERATOR_VERSION, week, species, attempts };
  }
  throw new Error(`No valid pool for ${week} in ${CONFIG.maxAttempts} attempts`);
}
