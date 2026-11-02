// The sets a player is offered for a species: at most three, so the builder
// stays small. Light (no simulator), so the web client can import it.
import { playerSets, type SetEntry, type SetsFile } from '@daily-battle/data';
import { GENERATOR_VERSION, seedPrefix } from './config';
import { rngFor, weightedSample } from './rng';

export const MAX_OFFERED_SETS = 3;

/**
 * A species' sets on offer for `key` (a week's Monday, or a versus room's):
 * every set if it has three or fewer; otherwise its most used set, one other
 * standard set drawn by usage, and its fun set (or a second standard set if
 * it has none). The same for everyone with the same key. `current`, a set the
 * player already has, always stays: it takes the drawn standard set's place.
 */
export function offeredSets(
  data: SetsFile,
  species: string,
  key: string,
  current?: string,
): SetEntry[] {
  const entry = data.species[species];
  const all = playerSets(entry);
  if (!entry || all.length <= MAX_OFFERED_SETS) return all;

  const standard = entry.sets;
  const top = standard.reduce((a, b) => (b.weight > a.weight ? b : a));
  const draws = MAX_OFFERED_SETS - 1 - (entry.fun ? 1 : 0);
  const rng = rngFor(
    `${seedPrefix(data.meta.format)}gen${GENERATOR_VERSION}:sets:${key}:${species}`,
  );
  const drawn = weightedSample(
    standard.filter((s) => s !== top),
    (s) => Math.max(s.weight, 1e-6),
    draws,
    rng,
  );
  const kept = standard.find((s) => s.id === current);
  if (kept && kept !== top && !drawn.includes(kept)) drawn[drawn.length - 1] = kept;
  // In the data's order, then the fun set.
  return [
    ...standard.filter((s) => s === top || drawn.includes(s)),
    ...(entry.fun ? [entry.fun] : []),
  ];
}
