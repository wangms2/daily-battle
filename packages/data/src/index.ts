import gen4ou from '../gen4ou/sets.json';
import gen5ou from '../gen5ou/sets.json';
import type { FormatId } from './formats';
import type { SetsFile } from './types';

export * from './formats';
export type { SetEntry, SetsFile, SpeciesEntry, Stats, StatID } from './types';

/** The Gen 4 OU set snapshot (see README for how it's built). */
export const sets = gen4ou as SetsFile;

const SETS: Record<FormatId, SetsFile> = { gen4ou: sets, gen5ou: gen5ou as SetsFile };

/** The set snapshot for a format. */
export function setsFor(format: string): SetsFile {
  const found = SETS[format as FormatId];
  if (!found) throw new Error(`No set data for ${format}`);
  return found;
}
