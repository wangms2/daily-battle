import gen4ou from '../gen4ou/species.json';
import gen5ou from '../gen5ou/species.json';
import gen6ou from '../gen6ou/species.json';
import type { FormatId } from './formats';
import type { SpeciesFile } from './species';

export type { MoveInfo, SpeciesFile, SpeciesInfo } from './species';

/** Types, base stats, and tier per species, plus the type chart, for Gen 4 OU. */
export const speciesData = gen4ou as SpeciesFile;

const SPECIES: Record<FormatId, SpeciesFile> = {
  gen4ou: speciesData,
  gen5ou: gen5ou as SpeciesFile,
  gen6ou: gen6ou as SpeciesFile,
};

/** Species facts for a format. */
export function speciesDataFor(format: string): SpeciesFile {
  const found = SPECIES[format as FormatId];
  if (!found) throw new Error(`No species data for ${format}`);
  return found;
}

/** The message the team builder shows when a second Mega would join a team. */
export const ONE_MEGA_MESSAGE = 'Only one Mega per team.';

/** How many of a team's sets hold their species' Mega Stone. */
export function megaCount(format: string, team: { species: string; item: string }[]): number {
  const { species } = speciesDataFor(format);
  return team.filter((s) => species[s.species]?.megas?.[s.item]).length;
}

/**
 * Our own team rule from Gen 6 (Showdown's Gen 6 OU has no such clause): at
 * most one Mega per side. Returns the problem, or null if the team is fine.
 */
export function oneMegaProblem(
  format: string,
  team: { species: string; item: string }[],
): string | null {
  return megaCount(format, team) > 1 ? ONE_MEGA_MESSAGE : null;
}
