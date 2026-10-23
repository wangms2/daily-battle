// A Pokémon's final stats at level 100 (what the battle uses), from its base
// stats and a set's nature, EVs and IVs. The same formula as Gens 3–5.
import type { SetEntry, StatID } from '@daily-battle/data';

export const STAT_IDS: StatID[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

/** [raised, lowered] for each non-neutral nature. */
const NATURES: Record<string, [StatID, StatID]> = {
  Lonely: ['atk', 'def'],
  Brave: ['atk', 'spe'],
  Adamant: ['atk', 'spa'],
  Naughty: ['atk', 'spd'],
  Bold: ['def', 'atk'],
  Relaxed: ['def', 'spe'],
  Impish: ['def', 'spa'],
  Lax: ['def', 'spd'],
  Timid: ['spe', 'atk'],
  Hasty: ['spe', 'def'],
  Jolly: ['spe', 'spa'],
  Naive: ['spe', 'spd'],
  Modest: ['spa', 'atk'],
  Mild: ['spa', 'def'],
  Quiet: ['spa', 'spe'],
  Rash: ['spa', 'spd'],
  Calm: ['spd', 'atk'],
  Gentle: ['spd', 'def'],
  Sassy: ['spd', 'spe'],
  Careful: ['spd', 'spa'],
};

export function finalStats(
  base: Record<string, number>,
  set: Pick<SetEntry, 'nature' | 'evs' | 'ivs'>,
): Record<StatID, number> {
  const [up, down] = NATURES[set.nature] ?? [];
  const out = {} as Record<StatID, number>;
  for (const k of STAT_IDS) {
    const b = base[k] ?? 0;
    const core = 2 * b + (set.ivs[k] ?? 31) + Math.floor((set.evs[k] ?? 0) / 4);
    if (k === 'hp') {
      out.hp = b === 1 ? 1 : core + 110;
    } else {
      const raw = core + 5;
      out[k] = k === up ? Math.floor(raw * 1.1) : k === down ? Math.floor(raw * 0.9) : raw;
    }
  }
  return out;
}
