import gen3ouCores from '../gen3ou/cores.json';
import gen3ou from '../gen3ou/sets.json';
import gen4ouCores from '../gen4ou/cores.json';
import gen4ou from '../gen4ou/sets.json';
import gen5ouCores from '../gen5ou/cores.json';
import gen5ou from '../gen5ou/sets.json';
import gen6ouCores from '../gen6ou/cores.json';
import gen6ou from '../gen6ou/sets.json';
import type { FormatId } from './formats';
import type { Core, SetsFile } from './types';

export * from './formats';
export type { Core, SetEntry, SetsFile, SpeciesEntry, Stats, StatID } from './types';
export { FUN_SET_PRIOR, playerSetPrior, playerSets } from './player-sets';

/** The Gen 4 OU set snapshot (see README for how it's built). */
export const sets = gen4ou as SetsFile;

const SETS: Record<FormatId, SetsFile> = {
  gen3ou: gen3ou as SetsFile,
  gen4ou: sets,
  gen5ou: gen5ou as SetsFile,
  gen6ou: gen6ou as SetsFile,
};

/** The set snapshot for a format. */
export function setsFor(format: string): SetsFile {
  const found = SETS[format as FormatId];
  if (!found) throw new Error(`No set data for ${format}`);
  return found;
}

const CORES: Record<FormatId, Core[]> = {
  gen3ou: gen3ouCores as Core[],
  gen4ou: gen4ouCores as Core[],
  gen5ou: gen5ouCores as Core[],
  gen6ou: gen6ouCores as Core[],
};

/** The hand-picked cores for a format (see `Core`). */
export function coresFor(format: string): Core[] {
  const found = CORES[format as FormatId];
  if (!found) throw new Error(`No cores for ${format}`);
  return found;
}
