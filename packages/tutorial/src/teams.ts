import { setsFor } from '@daily-battle/data';
import { findSet, toPokemonSet } from '@daily-battle/gen';
import { Dex, type PokemonSet } from '@pkmn/sim';
import type { Mon } from './types';

const NEUTRAL = { hp: 85, atk: 85, def: 85, spa: 85, spd: 85, spe: 85 };
const MAX_IVS = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };

export function monSet(format: string, mon: Mon): PokemonSet {
  if ('setId' in mon) return toPokemonSet(mon.species, findSet(setsFor(format), mon));
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
