import data from '../gen4ou/sets.json';
import type { SetsFile } from './types';

export type { SetEntry, SetsFile, SpeciesEntry, Stats, StatID } from './types';

/** The Gen 4 OU set snapshot (see README for how it's built). */
export const sets = data as SetsFile;
