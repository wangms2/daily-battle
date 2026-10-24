// Pools and teams for a room's game: the 12 everyone builds from, checking a
// built team, a team for anyone who didn't build in time, and the AI's.
import { setsFor } from '@daily-battle/data';
import { generateOpponent, generatePool, teamSets, type Style } from '@daily-battle/gen';
import type { Pool, RoomSettings, Slot } from '@daily-battle/versus';
import { teamProblems } from '@daily-battle/sim-bridge';
import type { PokemonSet } from '@pkmn/sim';

/** A random pool for the room: the same generator as the weekly pools, keyed by the room. */
export function randomPool(format: string, code: string, draw: number): Pool {
  const pool = generatePool(`room:${code}:${draw}`, setsFor(format));
  return { species: pool.species, source: 'random', draw };
}

/** This week's daily pool for the game, from the published schedule; null if there's none. */
export async function weeklyPool(assets: Fetcher, settings: RoomSettings): Promise<Pool | null> {
  if (!settings.week) return null;
  const dir = settings.format === 'gen4ou' ? '' : `${settings.format}/`;
  const res = await assets.fetch(`https://assets.local/schedule/${dir}${settings.week}.json`);
  if (!res.ok) return null;
  const file = (await res.json()) as { pool?: { species?: unknown } };
  const species = file.pool?.species;
  if (!Array.isArray(species) || species.length !== 12) return null;
  return { species: species as string[], source: 'weekly', draw: 0, week: settings.week };
}

/**
 * The sets for a team of slots, or null if a set doesn't exist or the team
 * isn't legal (the validator, plus one Mega per team from Gen 6).
 */
export function legalTeam(format: string, team: Slot[]): PokemonSet[] | null {
  let sets: PokemonSet[];
  try {
    sets = teamSets(setsFor(format), team);
  } catch {
    return null;
  }
  return teamProblems(format, sets) ? null : sets;
}

/**
 * A team for someone who didn't build in time: the pool's most used species,
 * each with its most used set, skipping any that would make the team illegal.
 */
export function autoTeam(format: string, pool: readonly string[], size: number): Slot[] {
  const data = setsFor(format);
  const ranked = [...pool].sort((a, b) => data.species[b]!.usage - data.species[a]!.usage);
  const team: Slot[] = [];
  for (const species of ranked) {
    if (team.length === size) break;
    const next = [...team, { species, setId: data.species[species]!.sets[0]!.id }];
    if (legalTeam(format, next)) team.push(next.at(-1)!);
  }
  return team;
}

/** The AI's team and style for a round: a daily-style opponent, at its foe's team size. */
export function aiTeam(format: string, key: string, size: number): { slots: Slot[]; style: Style } {
  const opponent = generateOpponent(key, setsFor(format));
  return { slots: opponent.team.slice(0, size), style: opponent.style };
}
