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

export interface PickOptions {
  /** Moves a reference (Random Battles) uses on this species: each counts double. */
  preferred?: ReadonlySet<string>;
  /** Whether a move deals damage, for `minAttacks`. */
  isAttack?: (move: string) => boolean;
  /** An attacker's set needs this many attacks when some combination has them. */
  minAttacks?: number;
}

/** Attacks that do little when locked in by a Choice item. */
const CHOICE_USELESS = ['focuspunch', 'flail', 'reversal'];
/** Status moves a Choice set still wants: passing the item on, or fainting for a teammate. */
const CHOICE_STATUS = ['trick', 'switcheroo', 'healingwish', 'memento', 'lunardance'];

/** How much the analysis's first-listed option, or a preferred move, counts over usage. */
export const LISTED_FIRST_BONUS = 2;

/**
 * Picks one option per move slot, with no repeats, as a whole set: the
 * product of usage shares (floored at 0.001 so unseen moves still count),
 * doubled for each slot's first-listed option (the analysis's own pick) and
 * for each preferred move, so usage has to clearly beat them. Combinations
 * with `minAttacks` attacks win over those without. Ties keep the earlier
 * listed combination. Returns null if no repeat-free choice exists.
 */
export function pickMoves(
  slots: string[][],
  shares: Map<string, number>,
  { preferred, isAttack, minAttacks = 0 }: PickOptions = {},
): string[] | null {
  const bonus = Math.log(LISTED_FIRST_BONUS);
  const logShare = (m: string, first: boolean) =>
    Math.log(Math.max(shares.get(toID(m)) ?? 0, 0.001)) +
    (first ? bonus : 0) +
    (preferred?.has(toID(m)) ? bonus : 0);
  let best: string[] | null = null;
  let bestKey: [number, number] = [-1, -Infinity];
  const walk = (i: number, chosen: string[], score: number) => {
    if (i === slots.length) {
      const attacks = isAttack ? chosen.filter(isAttack).length : 0;
      const key: [number, number] = [attacks >= minAttacks ? 1 : 0, score];
      if (key[0] > bestKey[0] || (key[0] === bestKey[0] && key[1] > bestKey[1])) {
        best = [...chosen];
        bestKey = key;
      }
      return;
    }
    const options = slots[i]!;
    options.forEach((m, n) => {
      if (chosen.some((c) => toID(c) === toID(m))) return;
      chosen.push(m);
      walk(i + 1, chosen, score + logShare(m, n === 0 && options.length > 1));
      chosen.pop();
    });
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
  /** Moves Random Battles use on the species (ids), preferred in a slashed slot. */
  preferred?: ReadonlySet<string>,
): ResolvedSet | null {
  const dex = Dex.forGen(gen);
  // An attacking spread (not a bulky one) gets at least two attacks where the slots allow.
  const evs = fillStats(asArray(set.evs)[0], 0);
  const bulky = evs.hp >= 200 && Math.max(evs.def, evs.spd) >= 160;
  const attacker = !bulky && Math.max(evs.atk, evs.spa) >= 200;
  // Locked into one move, a Choice set has no use for status moves (but Trick)
  // or moves that need a hit first or low HP; skip them where a slot offers more.
  const item = pick(asArray(set.item), usage.items) ?? '';
  const slots = set.moves.map(asArray).map((options) => {
    if (!item.startsWith('Choice')) return options;
    const useful = options.filter((m) => {
      const move = dex.moves.get(m);
      if (CHOICE_USELESS.includes(move.id)) return false;
      return move.category !== 'Status' || CHOICE_STATUS.includes(move.id);
    });
    return useful.length ? useful : options;
  });
  const moves = pickMoves(slots, usage.moves, {
    preferred,
    isAttack: (m) => dex.moves.get(m).category !== 'Status',
    minAttacks: attacker ? 2 : 0,
  });
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

  // Natures are picked apart from the spread, so skip any that lowers a stat it
  // invests in, or raises the defense it doesn't when it invests in the other
  // (Careful on a 224 Def spread).
  const natures = asArray(set.nature).filter((n) => {
    const { plus, minus } = dex.natures.get(n);
    if (minus && evs[minus] >= 100) return false;
    if (plus === 'def' || plus === 'spd') {
      const other = plus === 'def' ? 'spd' : 'def';
      if (evs[plus] < 100 && evs[other] >= 100) return false;
    }
    return true;
  });

  return {
    species,
    moves,
    item,
    ability: ability ?? '',
    nature: pick(natures.length ? natures : asArray(set.nature), usage.natures) ?? 'Serious',
    evs,
    ivs,
  };
}
