// Thin wrapper around @smogon/calc. Every helper takes the calc generation,
// which comes from the set data's format (`genFor(data.meta.format)`).
import { genOf } from '@daily-battle/data';
import { calculate, Field, Generations, Move, Pokemon } from '@smogon/calc';
import type { SideConds } from './state';

export type Gen = ReturnType<typeof Generations.get>;

const GENS = new Map<number, Gen>();

/** The calc generation for a format id, e.g. `gen4ou` → Gen 4. Built once per generation. */
export function genFor(format: string): Gen {
  const num = genOf(format);
  let gen = GENS.get(num);
  if (!gen) GENS.set(num, (gen = Generations.get(num as Parameters<typeof Generations.get>[0])));
  return gen;
}

type StatusName = '' | 'slp' | 'psn' | 'brn' | 'frz' | 'par' | 'tox';
type Stats = { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };

export interface MonSpec {
  species: string;
  item: string;
  ability: string;
  nature: string;
  evs: Partial<Stats>;
  ivs: Partial<Stats>;
  boosts: Partial<Stats>;
  status: string;
  /** Current HP as a fraction of max, 0–1. */
  hpFrac: number;
}

const STATUSES = new Set(['slp', 'psn', 'brn', 'frz', 'par', 'tox']);

export function makeMon(gen: Gen, spec: MonSpec): Pokemon {
  const mon = new Pokemon(gen, spec.species, {
    item: spec.item as never,
    ability: spec.ability as never,
    nature: spec.nature as never,
    evs: spec.evs,
    ivs: spec.ivs,
    boosts: spec.boosts,
    status: (STATUSES.has(spec.status) ? spec.status : '') as StatusName,
  });
  mon.originalCurHP = Math.max(1, Math.round(mon.maxHP() * spec.hpFrac));
  return mon;
}

const WEATHER: Record<string, 'Sand' | 'Rain' | 'Sun' | 'Hail'> = {
  sandstorm: 'Sand',
  raindance: 'Rain',
  sunnyday: 'Sun',
  hail: 'Hail',
};

const TERRAIN: Record<string, 'Electric' | 'Grassy' | 'Misty' | 'Psychic'> = {
  electricterrain: 'Electric',
  grassyterrain: 'Grassy',
  mistyterrain: 'Misty',
  psychicterrain: 'Psychic',
};

/** The calc field for one direction of attack. Terrains arrive in Gen 6. */
export function makeField(
  weather: string,
  attacker: SideConds,
  defender: SideConds,
  terrain = '',
): Field {
  const side = (s: SideConds) => ({
    isSR: s.sr,
    spikes: s.spikes,
    isReflect: s.reflect,
    isLightScreen: s.lightScreen,
  });
  return new Field({
    weather: WEATHER[weather],
    ...(TERRAIN[terrain] ? { terrain: TERRAIN[terrain] } : {}),
    attackerSide: side(attacker) as never,
    defenderSide: side(defender) as never,
  });
}

export interface Hit {
  /** Expected damage as a fraction of the defender's max HP, capped at its current HP. */
  frac: number;
  /** Probability (over damage rolls) of knocking the defender out from current HP. */
  ko: number;
}

const NO_HIT: Hit = { frac: 0, ko: 0 };

/** Expected damage of one move. Memoized per call site via `cache`. */
export function hit(
  attacker: Pokemon,
  defender: Pokemon,
  moveName: string,
  field: Field,
  cache?: Map<string, Hit>,
  key?: string,
): Hit {
  if (cache && key) {
    const cached = cache.get(key);
    if (cached) return cached;
  }
  let result: Hit = NO_HIT;
  try {
    const move = new Move(attacker.gen, moveName);
    if (move.category !== 'Status') {
      const { damage } = calculate(attacker.gen, attacker, defender, move, field);
      const rolls = (Array.isArray(damage) ? damage.flat() : [damage]) as number[];
      if (rolls.length && rolls.some((d) => d > 0)) {
        const cur = defender.curHP();
        const max = defender.maxHP();
        const mean = rolls.reduce((a, b) => a + b, 0) / rolls.length;
        result = {
          frac: Math.min(mean, cur) / max,
          ko: rolls.filter((d) => d >= cur).length / rolls.length,
        };
      }
    }
  } catch {
    result = NO_HIT;
  }
  if (cache && key) cache.set(key, result);
  return result;
}

/** A full set for one side of a quick damage check. */
export interface SetLike {
  species: string;
  item: string;
  ability: string;
  nature: string;
  evs: Partial<Stats>;
  ivs: Partial<Stats>;
  moves: string[];
}

const EMPTY_SIDE: SideConds = {
  sr: false,
  spikes: 0,
  tspikes: 0,
  web: false,
  reflect: false,
  lightScreen: false,
};

/**
 * Best expected damage (fraction of max HP) any of the attacker's moves does
 * to the defender at full HP, on a neutral field. Used offline (M5) to spot
 * Pokémon a pool has no answer to.
 */
export function bestDamage(gen: Gen, attacker: SetLike, defender: SetLike): number {
  const a = makeMon(gen, { ...attacker, boosts: {}, status: '', hpFrac: 1 });
  const d = makeMon(gen, { ...defender, boosts: {}, status: '', hpFrac: 1 });
  const field = makeField('', EMPTY_SIDE, EMPTY_SIDE);
  return Math.max(0, ...attacker.moves.map((m) => hit(a, d, m, field).frac));
}

export function moveInfo(gen: Gen, name: string) {
  const move = new Move(gen, name);
  return { category: move.category, type: move.type, priority: move.priority, bp: move.bp };
}

const BOOST = [1, 1.5, 2, 2.5, 3, 3.5, 4];
const boostMult = (stage: number) => (stage >= 0 ? BOOST[stage]! : 1 / BOOST[-stage]!);

/** Effective Speed with the main modifiers (Gens 4–6). */
export function speed(mon: Pokemon, weather: string): number {
  let spe = mon.rawStats.spe * boostMult(Math.max(-6, Math.min(6, mon.boosts.spe ?? 0)));
  if (mon.hasItem('Choice Scarf')) spe *= 1.5;
  if (mon.hasAbility('Quick Feet') && mon.status) spe *= 1.5;
  else if (mon.status === 'par') spe *= 0.25;
  if (mon.hasAbility('Swift Swim') && weather === 'raindance') spe *= 2;
  if (mon.hasAbility('Chlorophyll') && weather === 'sunnyday') spe *= 2;
  return spe;
}

export function typesOf(gen: Gen, species: string): string[] {
  return [
    ...(gen.species.get(species.toLowerCase().replace(/[^a-z0-9]/g, '') as never)?.types ?? []),
  ];
}

/** Type effectiveness multiplier of an attacking type against a species. */
export function effectiveness(gen: Gen, type: string, species: string): number {
  return typesOf(gen, species).reduce(
    (m, t) => m * (gen.types.get(type.toLowerCase() as never)?.effectiveness[t as never] ?? 1),
    1,
  );
}
