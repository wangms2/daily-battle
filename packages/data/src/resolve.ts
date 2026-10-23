import { Dex, toID } from '@pkmn/sim';
import type { ChaosSpecies, CuratedSet, Stats } from './types';

/** Usage shares (0–1) keyed by id, e.g. `moves.get('earthquake')`. */
export interface UsageShares {
  moves: Map<string, number>;
  items: Map<string, number>;
  abilities: Map<string, number>;
  natures: Map<string, number>;
}

export function usageShares(species: ChaosSpecies): UsageShares {
  // Every Pokémon has exactly one ability, so the ability counts sum to the total.
  const total = Object.values(species.Abilities).reduce((a, b) => a + b, 0) || 1;
  const toShares = (counts: Record<string, number>) =>
    new Map(Object.entries(counts).map(([name, n]) => [toID(name), n / total]));
  return {
    moves: toShares(species.Moves),
    items: toShares(species.Items),
    abilities: toShares(species.Abilities),
    natures: toShares(species.Natures),
  };
}

export interface ResolvedSet {
  species: string;
  moves: string[];
  item: string;
  ability: string;
  nature: string;
  evs: Stats;
  ivs: Stats;
}

const asArray = <T>(x: T | T[] | undefined): T[] =>
  x === undefined ? [] : Array.isArray(x) ? x : [x];

/** Highest-share option; ties keep the listed order. */
function pick(options: string[], shares: Map<string, number>): string | undefined {
  let best: string | undefined;
  let bestShare = -1;
  for (const o of options) {
    const s = shares.get(toID(o)) ?? 0;
    if (s > bestShare) {
      best = o;
      bestShare = s;
    }
  }
  return best;
}

function fillStats(partial: Partial<Stats> | undefined, fill: number): Stats {
  return { hp: fill, atk: fill, def: fill, spa: fill, spd: fill, spe: fill, ...partial };
}

/**
 * Abilities the species can legally have in a generation: ones introduced by
 * then, and hidden abilities only from Gen 5 (the Dream World) on.
 */
export function legalAbilities(species: string, gen: number): string[] {
  const dex = Dex.forGen(gen);
  const { abilities } = dex.species.get(species);
  return Object.entries(abilities)
    .filter(
      ([slot, name]) => (slot !== 'H' || gen >= 5) && name && dex.abilities.get(name).gen <= gen,
    )
    .map(([, name]) => name);
}

/**
 * Picks one option per move slot, with no repeats, maximizing the product of
 * usage shares (shares floored at 0.001 so unseen moves still count). Ties keep
 * the earlier listed combination. Returns null if no repeat-free choice exists.
 */
export function pickMoves(slots: string[][], shares: Map<string, number>): string[] | null {
  const logShare = (m: string) => Math.log(Math.max(shares.get(toID(m)) ?? 0, 0.001));
  let best: string[] | null = null;
  let bestScore = -Infinity;
  const walk = (i: number, chosen: string[], score: number) => {
    if (i === slots.length) {
      if (score > bestScore) {
        best = [...chosen];
        bestScore = score;
      }
      return;
    }
    for (const m of slots[i]!) {
      if (chosen.some((c) => toID(c) === toID(m))) continue;
      chosen.push(m);
      walk(i + 1, chosen, score + logShare(m));
      chosen.pop();
    }
  };
  walk(0, [], 0);
  return best;
}

/**
 * Turns a curated set with options into one concrete set: the move slots get
 * the best-fitting combination (see pickMoves), and the item, ability, and
 * nature each become their most-used option. Returns null if the move slots
 * can't be filled without repeating a move.
 */
export function resolveSet(
  species: string,
  set: CuratedSet,
  usage: UsageShares,
  gen: number,
  /** Abilities never to pick, falling back to the species' others (see `BUILD_RULES` in build.ts). */
  avoidAbilities: readonly string[] = [],
): ResolvedSet | null {
  const dex = Dex.forGen(gen);
  const moves = pickMoves(set.moves.map(asArray), usage.moves);
  if (!moves) return null;

  const allowed = (abilities: string[]) => abilities.filter((a) => !avoidAbilities.includes(a));
  const abilityOptions = allowed(asArray(set.ability));
  const ability = pick(
    abilityOptions.length ? abilityOptions : allowed(legalAbilities(species, gen)),
    usage.abilities,
  );

  const ivs = fillStats(asArray(set.ivs)[0], 31);
  const hiddenPower = moves.find(
    (m) => toID(m).startsWith('hiddenpower') && toID(m) !== 'hiddenpower',
  );
  if (hiddenPower) {
    // The curated IVs may be for a different Hidden Power option than the one picked.
    const type = dex.moves.get(hiddenPower).type;
    if (dex.getHiddenPower(ivs).type !== type) Object.assign(ivs, dex.types.get(type).HPivs);
  }

  return {
    species,
    moves,
    item: pick(asArray(set.item), usage.items) ?? '',
    ability: ability ?? '',
    nature: pick(asArray(set.nature), usage.natures) ?? 'Serious',
    evs: fillStats(asArray(set.evs)[0], 0),
    ivs,
  };
}
