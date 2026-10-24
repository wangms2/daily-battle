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
