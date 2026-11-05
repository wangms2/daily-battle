// Hazard facts (plan: facts layer): which of the foe's Pokémon you've seen a
// hazard would hit on every switch-in, and how hard, from a world's state
// (poke-engine's state string: types, HP, ability, item, side conditions).
import { Dex } from '@pkmn/sim';
import type { NetWorld } from '@daily-battle/engine-wasm';
import type { BranchWorld } from './branches';

export type HazardMove = 'spikes' | 'stealthrock' | 'toxicspikes' | 'stickyweb';

export interface HazardTarget {
  /** Species id (the state's, lowercase). */
  species: string;
  /** Damage per switch-in, as a share of max HP (Stealth Rock, Spikes). */
  frac?: number;
}

/** Side condition indices in the state (poke-engine's SideConditions order). */
const COND = { spikes: 12, stealthrock: 13, stickyweb: 14, toxicspikes: 17 } as const;
const MAX = { spikes: 3, stealthrock: 1, stickyweb: 1, toxicspikes: 2 } as const;
const SPIKES = [1 / 8, 1 / 6, 1 / 4];

const title = (t: string) => t[0]! + t.slice(1).toLowerCase();

/**
 * The foe's seen, standing Pokémon that `move` (set now, by side one) would
 * hit on every switch-in; undefined if it can't be set (at its maximum).
 */
export function hazardTargets(
  world: Pick<NetWorld, 'state' | 'known'>,
  move: HazardMove,
  gen: number,
): HazardTarget[] | undefined {
  const side = world.state.split('/')[1]!.split('=');
  const layers = Number(side[7]!.split(';')[COND[move]]);
  if (layers >= MAX[move]) return undefined;
  const dex = Dex.forGen(gen);
  const out: HazardTarget[] = [];
  for (let i = 0; i < 6; i++) {
    if (!world.known[i]?.seen) continue;
    const f = side[i]!.split(',');
    if (!(Number(f[6]) > 0)) continue;
    const types = [f[2]!, f[3]!].filter((t) => t !== 'TYPELESS').map(title);
    const ability = f[8]!.toLowerCase();
    const item = f[10]!.toLowerCase();
    const grounded = !types.includes('Flying') && ability !== 'levitate' && item !== 'airballoon';
    const guard = ability === 'magicguard';
    const species = f[0]!.toLowerCase();
    if (move === 'stealthrock') {
      if (!guard) out.push({ species, frac: 2 ** dex.getEffectiveness('Rock', types) / 8 });
    } else if (move === 'spikes') {
      if (grounded && !guard) out.push({ species, frac: SPIKES[layers]! });
    } else if (move === 'toxicspikes') {
      if (
        grounded &&
        !types.includes('Poison') &&
        !types.includes('Steel') &&
        ability !== 'immunity'
      )
        out.push({ species });
    } else if (grounded) out.push({ species });
  }
  return out;
}

/**
 * The targets that hold in at least `share` of the worlds (by weight), with
 * their damage in the heaviest world; undefined if the move can't be set in
 * some world.
 */
export function sureTargets(
  worlds: readonly BranchWorld[],
  move: HazardMove,
  gen: number,
  share: number,
): HazardTarget[] | undefined {
  const total = worlds.reduce((a, w) => a + w.weight, 0);
  const seen = new Map<string, { weight: number; target: HazardTarget }>();
  for (const w of [...worlds].sort((a, b) => b.weight - a.weight)) {
    if (!w.world) return undefined;
    const targets = hazardTargets(w.world, move, gen);
    if (!targets) return undefined;
    for (const t of targets) {
      const s = seen.get(t.species) ?? { weight: 0, target: t };
      s.weight += w.weight;
      seen.set(t.species, s);
    }
  }
  return [...seen.values()].filter((s) => s.weight >= share * total).map((s) => s.target);
}
