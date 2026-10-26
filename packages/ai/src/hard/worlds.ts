// Determinization: the foe's hidden sets (and, before Team Preview, its
// unseen Pokémon) are sampled into a few concrete "worlds" the engine can
// search with full information. Everything comes from what the AI may know:
// its own view, the public set data, and the public weekly pool.
import type { SetEntry, SetsFile } from '@daily-battle/data';
import type { Rng, SideView } from '@daily-battle/sim-bridge';
import { candidates, type KnownSets } from '../belief';
import { isMegaForme, megaFormeOf, type AIState } from '../state';
import type { WorldFoe } from './translate';

export interface World {
  foes: WorldFoe[];
  /** Probability mass: the share of samples that drew this world. */
  weight: number;
}

export interface WorldOptions {
  /** Worlds to draw before merging duplicates. */
  count: number;
  /** The week's public pool of species; unseen foes are drawn from it (Gen 3–4). */
  pool?: readonly string[];
  known?: KnownSets;
}

function pick<T>(items: readonly T[], weights: readonly number[], rng: Rng): number {
  const total = weights.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return Math.floor(rng() * items.length);
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]!;
    if (r < 0) return i;
  }
  return items.length - 1;
}

/** Usage-weighted sets of a species no one has seen yet. */
function unseenSets(data: SetsFile, species: string, megaUsed: boolean): SetEntry[] {
  const all = data.species[species]?.sets ?? [];
  if (!megaUsed) return all;
  const fit = all.filter((s) => !megaFormeOf(data.meta.format, species, s.item));
  return fit.length ? fit : all;
}

export function sampleWorlds(
  view: SideView,
  state: AIState,
  data: SetsFile,
  rng: Rng,
  options: WorldOptions,
): World[] {
  const foeClient = view.battle[view.side === 'p1' ? 'p2' : 'p1'];
  const seen = foeClient.team;
  const seenSpecies = new Set(state.foe.map((f) => f.species));
  const beliefs = state.foe.map((f, i) =>
    candidates(
      f,
      data,
      options.known,
      state.foe.some((o, j) => j !== i && isMegaForme(o.forme)),
    ),
  );
  const unseen = Math.max(0, Math.min(6, state.foeTotal) - seen.length);
  const speciesPool = (options.pool?.length ? [...options.pool] : Object.keys(data.species)).filter(
    (s) => !seenSpecies.has(s) && data.species[s]?.sets.length,
  );
  const poolWeights = speciesPool.map((s) =>
    options.pool?.length ? 1 : Math.max(data.species[s]!.usage, 1e-6),
  );

  const byKey = new Map<string, World>();
  const order: World[] = [];
  for (let w = 0; w < options.count; w++) {
    const foes: WorldFoe[] = beliefs.map((cands, i) => {
      const c =
        cands[
          pick(
            cands,
            cands.map((x) => x.weight),
            rng,
          )
        ]!;
      return { species: state.foe[i]!.species, set: c.set, seen: seen[i] };
    });
    const left = [...speciesPool];
    const leftWeights = [...poolWeights];
    for (let u = 0; u < unseen && left.length; u++) {
      const k = pick(left, leftWeights, rng);
      const species = left.splice(k, 1)[0]!;
      leftWeights.splice(k, 1);
      const sets = unseenSets(data, species, state.foeMegaUsed);
      foes.push({
        species,
        set: sets[
          pick(
            sets,
            sets.map((s) => s.weight),
            rng,
          )
        ]!,
      });
    }
    const key = foes.map((f) => `${f.species}:${f.set.id}`).join('|');
    const existing = byKey.get(key);
    if (existing) existing.weight += 1 / options.count;
    else {
      const world = { foes, weight: 1 / options.count };
      byKey.set(key, world);
      order.push(world);
    }
  }
  return order;
}
