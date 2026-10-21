// Independent checks of generator output, used by tests and `scripts/check.ts`.
// Written separately from the generators' own predicates (pool.ts, opponent.ts,
// traits.ts), scanning moves, EVs, and types directly, so a bug in one is
// unlikely to hide in the other.
import type { SetEntry, SetsFile } from '@daily-battle/data';
import { Dex, TeamValidator } from '@pkmn/sim';
import { CONFIG } from './config';
import type { DailyOpponent } from './opponent';
import type { WeeklyPool } from './pool';
import { teamSets } from './sets';

const dex = Dex.forGen(4);
const HAZARDS = ['Stealth Rock', 'Spikes', 'Toxic Spikes'];
const usesAny = (set: SetEntry, moves: string[]) => set.moves.some((m) => moves.includes(m));
const bulky = (s: SetEntry) => s.evs.hp >= 200 && Math.max(s.evs.def, s.evs.spd) >= 160;

/** Problems with a weekly pool, or [] if it meets DESIGN.md §6.2. */
export function verifyPool(pool: WeeklyPool, data: SetsFile, majorTypes: string[]): string[] {
  const problems: string[] = [];
  const { species } = pool;
  const allSets = (s: string) => data.species[s]?.sets ?? [];
  if (species.length !== CONFIG.pool.size) problems.push(`size ${species.length}`);
  if (new Set(species).size !== species.length) problems.push('duplicate species');
  if (species.some((s) => !data.species[s])) problems.push('unknown species');

  const anySet = (pred: (s: SetEntry) => boolean) => species.filter((sp) => allSets(sp).some(pred));
  // Spikes and hazard removal are soft constraints, so only Stealth Rock is required.
  if (!anySet((s) => s.moves.includes('Stealth Rock')).length) problems.push('no Stealth Rock');
  const belowOu = species.filter((s) => !['OU', '(OU)'].includes(data.species[s]?.tier ?? ''));
  if (belowOu.length < CONFIG.pool.belowOuMin || belowOu.length > CONFIG.pool.belowOuMax) {
    problems.push(`${belowOu.length} below-OU species`);
  }
  if (anySet(bulky).length < CONFIG.pool.minDefense) problems.push('too few defensive');
  const offensive = anySet((s) => !bulky(s) && Math.max(s.evs.atk, s.evs.spa) >= 200);
  if (offensive.length < CONFIG.pool.minOffense) problems.push('too few offensive');

  const top = Object.entries(data.species)
    .sort((a, b) => b[1].usage - a[1].usage)
    .slice(0, CONFIG.pool.topTierSize)
    .map(([s]) => s);
  if (species.filter((s) => top.includes(s)).length > CONFIG.pool.topTierMax) {
    problems.push('too many top-tier');
  }

  for (const type of majorTypes) {
    const checked = species.some((s) => {
      const types = dex.species.get(s).types;
      const immune = !dex.getImmunity(type, types);
      const resists = dex.getEffectiveness(type, types) < 0;
      const ability = allSets(s).some(
        (set) =>
          (set.ability === 'Levitate' && type === 'Ground') ||
          (set.ability === 'Flash Fire' && type === 'Fire') ||
          (['Water Absorb', 'Dry Skin'].includes(set.ability) && type === 'Water') ||
          (['Volt Absorb', 'Motor Drive'].includes(set.ability) && type === 'Electric'),
      );
      return immune || resists || ability;
    });
    if (!checked) problems.push(`no ${type} check`);
  }
  return problems;
}

/** Problems with a daily opponent, or [] if it meets DESIGN.md §6.3. */
export function verifyOpponent(opponent: DailyOpponent, data: SetsFile): string[] {
  const problems: string[] = [];
  const { team } = opponent;
  if (team.length !== CONFIG.opponent.size) problems.push(`size ${team.length}`);
  if (new Set(team.map((s) => s.species)).size !== team.length) problems.push('duplicate species');
  let sets: SetEntry[];
  try {
    sets = team.map((slot) => data.species[slot.species]!.sets.find((s) => s.id === slot.setId)!);
    if (sets.some((s) => !s)) throw new Error();
  } catch {
    return [...problems, 'unknown set'];
  }
  const invalid = TeamValidator.get(CONFIG.format).validateTeam(teamSets(data, team));
  if (invalid) problems.push(`illegal: ${invalid.join(' ')}`);
  if (sets.filter((s) => usesAny(s, HAZARDS)).length > CONFIG.opponent.maxHazardSetters) {
    problems.push('too many hazard setters');
  }
  if (!['offense', 'balance', 'stall'].includes(opponent.style)) problems.push('bad style');
  return problems;
}
