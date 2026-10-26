// The Hard opponent: Monte Carlo tree search in poke-engine over a few sampled
// worlds (the foe's hidden sets filled in from beliefs and the weekly pool),
// with the visit counts combined across worlds. Falls back to the strongest
// utility AI for Team Preview and anything the engine can't model.
import { sets as defaultSets, type SetsFile } from '@daily-battle/data';
import type { Engine, SearchResult } from '@daily-battle/engine-wasm';
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

/** One sampled world and the engine's search of it. */
export interface WorldSearch {
  /** The world's share of the samples. */
  weight: number;
  result: SearchResult;
}

/** One sampled world, ready for the engine: its state, iterations, and seed. */
export interface PreparedWorld {
  /** The world's share of the samples. */
  weight: number;
  /** The engine state, with `view`'s side as side one. */
  state: string;
  iterations: number;
  seed: number;
}

export type SearchWorldsOptions = Pick<
  HardPolicyOptions,
  'iterations' | 'worlds' | 'pool' | 'knownSets'
>;

/**
 * Samples a few worlds for the position from `view`'s side (the foe's hidden
 * sets filled in from beliefs and the pool) and splits the iterations by each
 * world's weight. Searching them is separate, so a caller can do it a world at
 * a time (the coach does, between the battle worker's messages).
 */
export function prepareWorlds(
  view: SideView,
  data: SetsFile,
  rng: Rng,
  options: SearchWorldsOptions = {},
): PreparedWorld[] {
  const state = extractState(view, data);
  const total = options.iterations ?? HARD_DEFAULTS.iterations;
  const worlds = sampleWorlds(view, state, data, rng, {
    count: options.worlds ?? HARD_DEFAULTS.worlds,
    ...(options.pool ? { pool: options.pool } : {}),
    ...(options.knownSets ? { known: options.knownSets } : {}),
  });
  const ownSets = state.own.map((m) => m.set);
  return worlds.map((world) => ({
    weight: world.weight,
    state: translate(view, world.foes, data, ownSets),
    iterations: Math.max(MIN_WORLD_ITERATIONS, Math.round(total * world.weight)),
    // Two draws make a 52-bit seed.
    seed: Math.floor(rng() * 2 ** 32) + Math.floor(rng() * 2 ** 20) * 2 ** 32,
  }));
}

/**
 * Searches one prepared world. With `fixed` (a choice such as `move 2`), the
 * searching side is held to that choice, so it gets every iteration; a choice
 * the engine doesn't offer gives an empty result.
 */
export function searchWorld(
  engine: Engine,
  request: SideView['request'],
  world: PreparedWorld,
  fixed?: string,
): SearchResult {
  if (fixed === undefined) return engine.search(world.state, world.iterations, world.seed);
  const option =
    request.requestType === 'wait' || request.requestType === 'team'
      ? -1
      : engine.options(world.state).s1.findIndex((c) => toChoice(c, request) === fixed);
  return option < 0
    ? { n: 0, s1: [], s2: [] }
    : engine.searchFixed(world.state, world.iterations, world.seed, option);
}

/**
 * Searches the position from `view`'s side over a few sampled worlds. Hard
 * uses it to choose; the coach uses it from the player's view to judge a
 * choice (DESIGN.md §22).
 */
export function searchWorlds(
  engine: Engine,
  view: SideView,
  data: SetsFile,
  rng: Rng,
  options: SearchWorldsOptions & {
    /** Hold `view`'s side to this choice (`move 2`, `switch 4`), so it gets every iteration. */
    fixed?: string;
  } = {},
): WorldSearch[] {
  return prepareWorlds(view, data, rng, options).map((world) => ({
    weight: world.weight,
    result: searchWorld(engine, view.request, world, options.fixed),
  }));
}

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
    const legalSet = new Set(legal);
    const value = new Map<string, number>();
    for (const { weight, result } of searchWorlds(
      this.engine,
      view,
      this.data,
      rng,
      this.options,
    )) {
      if (!result.n) continue;
      for (const option of result.s1) {
        const choice = toChoice(option.c, request);
        if (!choice || !legalSet.has(choice)) continue;
        value.set(choice, (value.get(choice) ?? 0) + (weight * option.v) / result.n);
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
