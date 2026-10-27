// The type trainer (DESIGN.md §22): quick questions on type matchups, an OU
// Pokémon and an attack type, with spaced repetition. A matchup (an attack type
// against a typing) sits in a box from 1 to 5: a right answer moves it up, a
// wrong one back to 1, and lower boxes come up more often. Only the boxes are
// saved; questions are generated from the game being played.
import { allTypes, ouSpecies, speciesInfo, typeChart } from './data';

/** Abilities that change how a type's moves hit their user: such questions are skipped. */
const ABILITY_TYPES: Record<string, readonly string[] | 'all'> = {
  Levitate: ['Ground'],
  'Flash Fire': ['Fire'],
  'Water Absorb': ['Water'],
  'Volt Absorb': ['Electric'],
  'Motor Drive': ['Electric'],
  'Dry Skin': ['Water', 'Fire'],
  'Sap Sipper': ['Grass'],
  'Storm Drain': ['Water'],
  'Lightning Rod': ['Electric'],
  'Thick Fat': ['Fire', 'Ice'],
  Heatproof: ['Fire'],
  'Wonder Guard': 'all',
};

export interface Question {
  species: string;
  types: string[];
  attack: string;
  /** The answer: the product of the multipliers against each type. */
  mult: number;
  /** Each of the defender's types and its multiplier, for the explanation. */
  parts: { type: string; mult: number }[];
}

/** The answers offered, strongest first. */
export const MULTIPLIERS = [4, 2, 1, 0.5, 0.25, 0] as const;

export const multLabel = (m: number) => (m === 0.5 ? '×½' : m === 0.25 ? '×¼' : `×${m}`);

/** What the games call each multiplier. */
export const multWords = (m: number) =>
  m > 1
    ? 'Super effective'
    : m === 1
      ? 'Normal damage'
      : m > 0
        ? 'Not very effective'
        : 'No effect';

/** A matchup's key: the attack type against the typing (in a fixed order). */
export const matchupKey = (attack: string, types: readonly string[]) =>
  `${attack}>${[...types].sort().join('/')}`;

/** The box of each matchup answered so far (1–5). */
export type Boxes = Record<string, number>;

/** How often a matchup comes up, by its box (0: not seen yet). */
const WEIGHT: Record<number, number> = { 0: 3, 1: 8, 2: 4, 3: 2, 4: 1, 5: 0.4 };

/** Whether one of a species' possible abilities changes how this type hits it. */
function abilityMatters(species: string, attack: string): boolean {
  return speciesInfo(species).abilities.some((a) => {
    const t = ABILITY_TYPES[a];
    return t === 'all' || !!t?.includes(attack);
  });
}

export function makeQuestion(species: string, attack: string): Question {
  const { types } = speciesInfo(species);
  const parts = types.map((type) => ({ type, mult: typeChart()[attack]?.[type] ?? 1 }));
  return { species, types, attack, mult: parts.reduce((m, p) => m * p.mult, 1), parts };
}

/**
 * The next question: candidates drawn at random (the game's OU Pokémon, any
 * attack type), one picked by its matchup's box. `avoid` keeps a matchup from
 * coming twice in a row.
 */
export function nextQuestion(
  boxes: Boxes,
  rng: () => number = Math.random,
  avoid?: string,
): Question {
  const species = ouSpecies();
  const types = allTypes();
  const candidates: { q: Question; w: number }[] = [];
  for (let tries = 0; candidates.length < 30 && tries < 300; tries++) {
    const s = species[Math.floor(rng() * species.length)]!;
    const attack = types[Math.floor(rng() * types.length)]!;
    if (abilityMatters(s, attack)) continue;
    const q = makeQuestion(s, attack);
    const key = matchupKey(attack, q.types);
    if (key === avoid) continue;
    candidates.push({ q, w: WEIGHT[boxes[key] ?? 0]! });
  }
  let r = rng() * candidates.reduce((a, c) => a + c.w, 0);
  for (const c of candidates) {
    r -= c.w;
    if (r <= 0) return c.q;
  }
  return candidates.at(-1)!.q;
}

/** The boxes after an answer: up one when right, back to 1 when wrong. */
export function answered(boxes: Boxes, q: Question, right: boolean): Boxes {
  const key = matchupKey(q.attack, q.types);
  return { ...boxes, [key]: right ? Math.min(5, (boxes[key] ?? 1) + 1) : 1 };
}
