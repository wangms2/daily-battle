// Who moves first: a foe's Speed from the sets it could be running (the same
// sets the coach weighs), against your active Pokémon's, with the battle's
// Speed changes applied the way the coach's calc does (packages/ai calc.ts
// `speed`). No simulator code here.
import type { SetEntry } from '@daily-battle/data';
import type { Mon } from '@daily-battle/tutorial/lessons';
import { findSet, speciesInfo } from './data';

const FAST_NATURES = new Set(['Timid', 'Hasty', 'Jolly', 'Naive']);
const SLOW_NATURES = new Set(['Brave', 'Relaxed', 'Quiet', 'Sassy']);

/** A Speed stat at level 100. */
export function speedStat(base: number, ev = 0, iv = 31, nature = 'Serious'): number {
  const raw = Math.floor(2 * base + iv + Math.floor(ev / 4)) + 5;
  const mult = FAST_NATURES.has(nature) ? 1.1 : SLOW_NATURES.has(nature) ? 0.9 : 1;
  return Math.floor(raw * mult);
}

/**
 * A foe's Speed as Showdown's tooltip shows it (battle-tooltips.ts
 * `getSpeedRange`), before boosts, items and abilities: the slowest it could
 * be (0 IVs, 0 EVs, a slowing nature), then 0 and 252 EVs with a neutral
 * nature, then the fastest (252 EVs, a boosting nature).
 */
export function showdownRange(base: number): [number, number, number, number] {
  return [
    speedStat(base, 0, 0, 'Brave'),
    speedStat(base, 0),
    speedStat(base, 252),
    speedStat(base, 252, 31, 'Jolly'),
  ];
}

/** Showdown's range with the foe's visible Speed stage and paralysis applied (not items or abilities). */
export function showdownNow(
  base: number,
  boost = 0,
  status?: string,
): Pick<SpeedCheck, 'showdown' | 'shown'> {
  const par = status === 'par';
  const s = { boost, ...(par && { status }) };
  return {
    showdown: showdownRange(base).map((v) => battleSpeed(v, s)) as [number, number, number, number],
    shown: { boost: Math.max(-6, Math.min(6, boost)), par },
  };
}

/** The note under Showdown's line: what it includes and what it doesn't. */
export function showdownNote(shown?: SpeedCheck['shown']): string {
  const has = [
    shown?.boost ? `${shown.boost > 0 ? '+' : ''}${shown.boost} Speed` : '',
    shown?.par ? 'paralysis' : '',
  ].filter(Boolean);
  return has.length
    ? `with its ${has.join(' and ')}, before items and abilities`
    : 'before boosts, items and abilities';
}

/** The slowest and fastest of Showdown's range. */
export function theoreticalRange(base: number): [number, number] {
  const r = showdownRange(base);
  return [r[0], r[3]];
}

/** A lesson Pokémon's set, for its Speed: a named set, or a custom one (neutral, 85 EVs each; packages/tutorial teams.ts). */
export function lessonSet(mon: Mon): Pick<SetEntry, 'nature' | 'evs' | 'ivs' | 'item' | 'ability'> {
  if ('setId' in mon) {
    const set = findSet({ species: mon.species, setId: mon.setId });
    if (set) return set;
  }
  return {
    nature: 'Serious',
    evs: { hp: 85, atk: 85, def: 85, spa: 85, spd: 85, spe: 85 },
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    item: ('item' in mon && mon.item) || '',
    ability: ('ability' in mon && mon.ability) || '',
  };
}

/** A lesson Pokémon's moves: its own list, or its named set's. */
export function lessonMoves(mon: Mon): string[] {
  if (mon.moves) return [...mon.moves];
  return 'setId' in mon ? (findSet({ species: mon.species, setId: mon.setId })?.moves ?? []) : [];
}

/** What changes Speed in battle. */
export interface SpeedState {
  boost?: number;
  status?: string;
  item?: string;
  ability?: string;
  /** The view's weather: 'RainDance', 'SunnyDay', … */
  weather?: string;
}

/** Speed in battle, as the coach computes it. */
export function battleSpeed(stat: number, s: SpeedState): number {
  const b = Math.max(-6, Math.min(6, s.boost ?? 0));
  let spe = stat * (b >= 0 ? (2 + b) / 2 : 2 / (2 - b));
  if (s.item === 'Choice Scarf') spe *= 1.5;
  if (s.ability === 'Quick Feet' && s.status) spe *= 1.5;
  else if (s.status === 'par') spe *= 0.25;
  if (s.ability === 'Swift Swim' && s.weather === 'RainDance') spe *= 2;
  if (s.ability === 'Chlorophyll' && s.weather === 'SunnyDay') spe *= 2;
  return Math.floor(spe);
}

/** The Speed facts behind a foe's card. */
export interface SpeedCheck {
  /** Showdown's line (`showdownRange`), unless the foe's set is known (a lesson), with `shown` applied. */
  showdown?: [number, number, number, number];
  /** What's visible on the foe and already in `showdown`: its Speed stage, paralysis. */
  shown?: { boost: number; par: boolean };
  /** `lo`–`hi` come from this game's sets for it (Beginner hints), so the card shows them too. */
  fromSets?: boolean;
  /** The foe's Speed now, for the comparison: one number when every set agrees. */
  lo: number;
  hi: number;
  /**
   * The fastest a Choice Scarf set would be, when one is possible but not
   * shown: kept apart so one rare set doesn't make every range "either way".
   */
  scarf?: number;
  /** Your active Pokémon, to compare with. */
  mine?: { species: string; speed: number };
}

/**
 * A foe's Speed range now, from the sets it could be running (each with its
 * own item and ability), or the theoretical range when there are none.
 */
export function foeSpeed(
  species: string,
  sets: Pick<SetEntry, 'nature' | 'evs' | 'ivs' | 'item' | 'ability'>[],
  state: SpeedState,
): Omit<SpeedCheck, 'mine'> {
  const base = speciesInfo(species).baseStats.spe;
  const of = (s: (typeof sets)[number]) =>
    battleSpeed(speedStat(base, s.evs?.spe ?? 0, s.ivs?.spe ?? 31, s.nature), {
      ...state,
      item: s.item,
      ability: s.ability,
    });
  if (!sets.length) {
    const [lo, hi] = theoreticalRange(base).map((v) => battleSpeed(v, state)) as [number, number];
    return { lo, hi };
  }
  const scarf = sets.filter((s) => s.item === 'Choice Scarf');
  const usual = sets.filter((s) => s.item !== 'Choice Scarf');
  // Every set left is a Scarf one (it has shown its Scarf): that's its range.
  const main = (usual.length ? usual : scarf).map(of);
  const out: Omit<SpeedCheck, 'mine'> = { lo: Math.min(...main), hi: Math.max(...main) };
  if (usual.length && scarf.length) {
    const fastest = Math.max(...scarf.map(of));
    if (fastest > out.hi) out.scarf = fastest;
  }
  return out;
}

/** The Scarf caveat is worth a line only when a Scarf would make the foe faster and the main line doesn't say so. */
export function scarfFlips(c: SpeedCheck): boolean {
  return !!c.scarf && !!c.mine && c.scarf > c.mine.speed && c.lo <= c.mine.speed;
}

/** Faster, slower, a tie, or it could go either way. */
export function speedVerdict(c: SpeedCheck): 'faster' | 'slower' | 'tie' | 'either' | undefined {
  if (!c.mine) return undefined;
  const m = c.mine.speed;
  if (c.lo > m) return 'faster';
  if (c.hi < m) return 'slower';
  if (c.lo === m && c.hi === m) return 'tie';
  return 'either';
}
