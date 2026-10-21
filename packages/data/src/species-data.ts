import data from '../gen4ou/species.json';
import type { SpeciesFile } from './species';

export type { SpeciesFile, SpeciesInfo } from './species';

/** Types, base stats, and tier per species, plus the Gen 4 type chart. */
export const speciesData = data as SpeciesFile;
