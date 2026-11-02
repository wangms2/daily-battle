// A player's sets: the standard ones plus a species' fun set. Kept apart from
// the data files so build scripts can use it without loading every format.
import type { SetEntry, SpeciesEntry } from './types';

/** A player's choice of sets for a species: the standard sets, then its fun set. */
export const playerSets = (entry: SpeciesEntry | undefined): SetEntry[] =>
  entry ? (entry.fun ? [...entry.sets, entry.fun] : entry.sets) : [];

/** How likely a guess at a player's set takes the fun set, where a species has one. */
export const FUN_SET_PRIOR = 0.05;

/**
 * The sets a player might bring, weighted for a guess (the AI's belief): the
 * standard sets' weights scaled down to make room for the fun set's share.
 */
export function playerSetPrior(entry: SpeciesEntry | undefined): SetEntry[] {
  if (!entry?.fun) return entry?.sets ?? [];
  return [
    ...entry.sets.map((s) => ({ ...s, weight: s.weight * (1 - FUN_SET_PRIOR) })),
    { ...entry.fun, weight: FUN_SET_PRIOR },
  ];
}
