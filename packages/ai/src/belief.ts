// What the AI believes about each foe Pokémon's hidden set (DESIGN.md §8.2):
// the species' usage-weighted sets, filtered by everything revealed so far.
import { sets as defaultSets, type SetEntry, type SetsFile } from '@daily-battle/data';
import { isMegaForme, megaFormeOf, moveId, toId, type FoeMon } from './state';

export interface Candidate {
  set: SetEntry;
  weight: number;
}

/** Exact sets to assume instead of beliefs, keyed by species (informed mode, §9.1). */
export type KnownSets = Record<string, SetEntry>;

const IGNORED_MOVES = new Set(['struggle', 'recharge']);

export function consistent(set: SetEntry, foe: FoeMon, checkItem = true): boolean {
  const moves = new Set(set.moves.map(moveId));
  for (const m of foe.moves) {
    if (IGNORED_MOVES.has(m)) continue;
    // Hidden Power can show up without its type.
    if (
      m === 'hiddenpower' ? ![...moves].some((x) => x.startsWith('hiddenpower')) : !moves.has(m)
    ) {
      return false;
    }
  }
  if (checkItem && foe.item && toId(set.item) !== foe.item) return false;
  if (foe.ability && toId(set.ability) !== foe.ability) return false;
  return true;
}

/**
 * Mega Evolution narrows a foe's sets (Gen 6 on): once it has Mega Evolved,
 * only sets with that stone fit; once a teammate has, none of its stone sets
 * do (one Mega per team). Never narrows to nothing.
 */
function megaFit(all: SetEntry[], foe: FoeMon, data: SetsFile, foeMegaUsed: boolean): SetEntry[] {
  const mega = (s: SetEntry) => megaFormeOf(data.meta.format, foe.species, s.item);
  let fit = all;
  if (isMegaForme(foe.forme)) fit = all.filter((s) => mega(s) === foe.forme);
  else if (foeMegaUsed) fit = all.filter((s) => !mega(s));
  return fit.length ? fit : all;
}

/** Candidate sets for a foe Pokémon, weights summing to 1. Never empty. */
export function candidates(
  foe: FoeMon,
  data: SetsFile = defaultSets,
  known?: KnownSets,
  /** A teammate of `foe` has already Mega Evolved. */
  foeMegaUsed = false,
): Candidate[] {
  const knownSet = known?.[foe.species];
  if (knownSet) return [{ set: knownSet, weight: 1 }];

  const all = megaFit(data.species[foe.species]?.sets ?? [], foe, data, foeMegaUsed);
  // Items can change hands (Trick, Knock Off), so relax the item check if nothing fits.
  let fit = all.filter((s) => consistent(s, foe));
  if (!fit.length) fit = all.filter((s) => consistent(s, foe, false));
  if (fit.length) {
    const total = fit.reduce((a, s) => a + s.weight, 0);
    return fit.map((set) => ({ set, weight: set.weight / total }));
  }
  return [{ set: fallbackSet(foe, all), weight: 1 }];
}

/** An off-meta foe: revealed moves plus the species' most common ones. */
function fallbackSet(foe: FoeMon, all: SetEntry[]): SetEntry {
  const base = [...all].sort((a, b) => b.weight - a.weight)[0];
  const moves = [...foe.moves];
  for (const m of base?.moves ?? [])
    if (moves.length < 4 && !moves.includes(moveId(m))) moves.push(m);
  return {
    id: `${toId(foe.species)}-unknown`,
    sourceName: 'Unknown',
    label: 'Unknown',
    description: '',
    weight: 1,
    moves,
    item: base?.item ?? '',
    ability: base?.ability ?? '',
    nature: base?.nature ?? 'Serious',
    evs: base?.evs ?? { hp: 84, atk: 84, def: 84, spa: 84, spd: 84, spe: 84 },
    ivs: base?.ivs ?? { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
  };
}
