import { setsFor, type SetEntry, type SetsFile } from '@daily-battle/data';
import { findSet, toPokemonSet } from '@daily-battle/gen';
import { Dex, type PokemonSet } from '@pkmn/sim';
import type { Mon } from './types';

const NEUTRAL = { hp: 85, atk: 85, def: 85, spa: 85, spd: 85, spe: 85 };
const MAX_IVS = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };

export function monSet(format: string, mon: Mon): PokemonSet {
  if ('setId' in mon) {
    const set = toPokemonSet(mon.species, findSet(setsFor(format), mon));
    return mon.moves ? { ...set, moves: [...mon.moves] } : set;
  }
  return {
    name: mon.species,
    species: mon.species,
    item: mon.item ?? '',
    ability: mon.ability ?? Dex.forFormat(format).species.get(mon.species).abilities[0],
    nature: 'Serious',
    evs: { ...NEUTRAL },
    ivs: { ...MAX_IVS },
    moves: [...mon.moves],
    level: 100,
    gender: '',
  };
}

export const teamOf = (format: string, mons: Mon[]): PokemonSet[] =>
  mons.map((m) => monSet(format, m));

/** A lesson team's real sets by species (for checking lesson content with the judge). */
export function knownSets(format: string, mons: Mon[]): Record<string, SetEntry> {
  const out: Record<string, SetEntry> = {};
  for (const m of mons) {
    const s = monSet(format, m);
    out[m.species] = {
      id: `lesson-${toId(m.species)}`,
      sourceName: 'lesson',
      label: 'Lesson',
      description: '',
      weight: 1,
      moves: s.moves,
      item: s.item,
      ability: s.ability,
      nature: s.nature,
      evs: { ...NEUTRAL, ...s.evs },
      ivs: { ...MAX_IVS, ...s.ivs },
    };
  }
  return out;
}

/**
 * The game's set data with a lesson foe's species narrowed to its lesson set:
 * in a lesson the foe is fixed content, so the coach's facts and judge use it
 * (rather than the real competitive sets a daily foe might carry).
 */
export function withLessonSets(format: string, mons: Mon[]): SetsFile {
  const data = setsFor(format);
  const known = knownSets(format, mons);
  return {
    ...data,
    species: {
      ...data.species,
      ...Object.fromEntries(
        Object.entries(known).map(([name, set]) => [name, { ...data.species[name]!, sets: [set] }]),
      ),
    },
  };
}

const toId = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
