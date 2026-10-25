// The Hard opponent: Monte Carlo tree search in poke-engine over a few sampled
// worlds (the foe's hidden sets filled in from beliefs and the weekly pool),
// with the visit counts combined across worlds. Falls back to the strongest
// utility AI for Team Preview and anything the engine can't model.
import { sets as defaultSets, type SetsFile } from '@daily-battle/data';
import type { Engine } from '@daily-battle/engine-wasm';
import { legalChoices, type Policy, type Rng, type SideView } from '@daily-battle/sim-bridge';
import type { KnownSets } from '../belief';
import { STRONG } from '../presets';
import { UtilityPolicy } from '../policy';
import { extractState } from '../state';
import { toChoice } from './choices';
import { translate } from './translate';
import { sampleWorlds } from './worlds';

export interface HardPolicyOptions {
  /** poke-engine built for this format's generation. */
  engine: Engine;
  data?: SetsFile;
  /** The week's public pool, the prior for foes not yet seen (Gen 3–4). */
  pool?: readonly string[];
  /** MCTS iterations per decision, split across worlds. Fixed, so a decision is reproducible. */
  iterations?: number;
  /** Worlds sampled per decision. */
  worlds?: number;
  /** Informed mode: the foe's real sets. Never set for real play. */
  knownSets?: KnownSets;
}

// 200k beat 40k 57% head to head (120 games, Gen 4); 150k keeps a mid-range phone under ~2 s.
export const HARD_DEFAULTS = { iterations: 150_000, worlds: 8 } as const;

export interface HardStats {
  decisions: number;
  /** Decisions made by search (the rest fell back). */
  searched: number;
  /** Engine errors, for diagnosing gaps (most recent few). */
  errors: string[];
}

const MIN_WORLD_ITERATIONS = 200;

export class HardPolicy implements Policy {
  readonly stats: HardStats = { decisions: 0, searched: 0, errors: [] };
  private readonly engine: Engine;
  private readonly data: SetsFile;
  private readonly fallback: UtilityPolicy;

  constructor(private readonly options: HardPolicyOptions) {
    this.engine = options.engine;
    this.data = options.data ?? defaultSets;
    this.fallback = new UtilityPolicy(STRONG, {
      data: this.data,
      ...(options.knownSets ? { knownSets: options.knownSets } : {}),
    });
  }

  choose(view: SideView, rng: Rng): string {
    const legal = legalChoices(view.request);
    if (legal.length <= 1) return legal[0] ?? 'default';
    this.stats.decisions++;
    if (view.request.requestType !== 'team') {
      try {
        const pick = this.search(view, rng, legal);
        if (pick) {
          this.stats.searched++;
          return pick;
        }
      } catch (err) {
        this.note(String((err as Error)?.message ?? err));
      }
    }
    return this.fallback.choose(view, rng);
  }

  private search(view: SideView, rng: Rng, legal: string[]): string | undefined {
    const request = view.request;
    if (request.requestType === 'wait' || request.requestType === 'team') return undefined;
    const state = extractState(view, this.data);
    const total = this.options.iterations ?? HARD_DEFAULTS.iterations;
    const worlds = sampleWorlds(view, state, this.data, rng, {
      count: this.options.worlds ?? HARD_DEFAULTS.worlds,
      ...(this.options.pool ? { pool: this.options.pool } : {}),
      ...(this.options.knownSets ? { known: this.options.knownSets } : {}),
    });
    const ownSets = state.own.map((m) => m.set);
    const legalSet = new Set(legal);
    const value = new Map<string, number>();
    for (const world of worlds) {
      const engineState = translate(view, world.foes, this.data, ownSets);
      const iterations = Math.max(MIN_WORLD_ITERATIONS, Math.round(total * world.weight));
      // Two draws make a 52-bit seed.
      const seed = Math.floor(rng() * 2 ** 32) + Math.floor(rng() * 2 ** 20) * 2 ** 32;
      const result = this.engine.search(engineState, iterations, seed);
      if (!result.n) continue;
      for (const option of result.s1) {
        const choice = toChoice(option.c, request);
        if (!choice || !legalSet.has(choice)) continue;
        value.set(choice, (value.get(choice) ?? 0) + (world.weight * option.v) / result.n);
      }
    }
    let best: string | undefined;
    let bestValue = -1;
    // Legal order breaks ties, so the pick doesn't depend on map order.
    for (const choice of legal) {
      const v = value.get(choice);
      if (v !== undefined && v > bestValue) {
        best = choice;
        bestValue = v;
      }
    }
    if (!best) this.note(`no legal engine option (legal: ${legal.join(', ')})`);
    return best;
  }

  private note(message: string) {
    this.stats.errors.push(message.slice(0, 300));
    if (this.stats.errors.length > 20) this.stats.errors.shift();
  }
}
