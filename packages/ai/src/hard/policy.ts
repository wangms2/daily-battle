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
import { translate, type WorldFoe } from './translate';
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
  /**
   * Choices whose value is at least this fraction of the best's are near-ties,
   * and one is drawn in proportion to value (1: always the best).
   */
  variety?: number;
}

// 200k beat 40k 57% head to head (120 games, Gen 4); 150k keeps a mid-range phone under ~2 s.
export const HARD_DEFAULTS = { iterations: 150_000, worlds: 8, variety: 0.9 } as const;

export interface HardStats {
  decisions: number;
  /** Decisions made by search (the rest fell back). */
  searched: number;
  /** Searched decisions where a near-tie, not the best, was drawn. */
  varied: number;
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
  /** The foe's Pokémon as sampled, in the engine's order (`switch:I` indexes it). */
  foes: WorldFoe[];
  /** The foe's active Pokémon (its moves, in set order, are `move:I`). */
  foeActive: number;
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
  const foeClient = view.battle[view.side === 'p1' ? 'p2' : 'p1'];
  return worlds.map((world) => ({
    weight: world.weight,
    state: translate(view, world.foes, data, ownSets),
    foes: world.foes,
    // As translate finds it.
    foeActive: Math.max(
      0,
      world.foes.findIndex((f) => f.seen && f.seen === foeClient.active[0]),
    ),
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

/**
 * One decision, searched a world at a time (`step`), so the battle worker can
 * do it while you choose (DESIGN.md §7). Run to the end it gives exactly what
 * `choose` would: `choose` is this job, run at once.
 */
export interface DecisionJob {
  /** Does one slice of the work (one world not handed out); true while there's more. */
  step(): boolean;
  /**
   * Hands out a world to search elsewhere (another worker), or nothing if none
   * is left. Results are combined in world order however they arrive, so the
   * choice is the same; a world never given back is searched by `result`.
   */
  claim(): WorldClaim | undefined;
  /** Finishes any work left and gives the choice. */
  result(): string;
}

/** A world handed out by `DecisionJob.claim`, and where its search goes. */
export interface WorldClaim {
  world: PreparedWorld;
  give(result: SearchResult): void;
}

const settled = (choice: string): DecisionJob => ({
  step: () => false,
  claim: () => undefined,
  result: () => choice,
});

export class HardPolicy implements Policy {
  readonly stats: HardStats = { decisions: 0, searched: 0, varied: 0, errors: [] };
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
    return this.think(view, rng).result();
  }

  /**
   * The decision as a job. `rng` is drawn from as the job runs, so it should be
   * this decision's own (the battle engine derives one per decision).
   */
  think(view: SideView, rng: Rng): DecisionJob {
    const legal = legalChoices(view.request);
    if (legal.length <= 1) return settled(legal[0] ?? 'default');
    this.stats.decisions++;
    const request = view.request;
    if (request.requestType === 'team' || request.requestType === 'wait')
      return settled(this.fallback.choose(view, rng));
    let worlds: PreparedWorld[] | undefined;
    // By world index; `claimed` ones are being searched elsewhere.
    const results: (SearchResult | undefined)[] = [];
    const claimed = new Set<number>();
    let pick: string | undefined;
    const fail = (err: unknown) => {
      this.note(String((err as Error)?.message ?? err));
      pick = this.fallback.choose(view, rng);
    };
    const prepare = (): PreparedWorld[] | undefined => {
      try {
        return (worlds ??= prepareWorlds(view, this.data, rng, this.options));
      } catch (err) {
        fail(err);
      }
    };
    const finish = () => {
      const searched = worlds!.map((world, i) => ({ weight: world.weight, result: results[i]! }));
      const best = this.best(searched, request, legal, rng);
      if (best) this.stats.searched++;
      pick = best ?? this.fallback.choose(view, rng);
    };
    // Searches world `i` here; with `all`, ones handed out too (never given back).
    const search = (all: boolean): boolean => {
      if (pick !== undefined || !prepare()) return false;
      try {
        const i = worlds!.findIndex((_, i) => !results[i] && (all || !claimed.has(i)));
        if (i >= 0) results[i] = searchWorld(this.engine, request, worlds![i]!);
        if (results.filter(Boolean).length < worlds!.length) return i >= 0;
        finish();
      } catch (err) {
        fail(err);
      }
      return false;
    };
    return {
      step: () => search(false),
      claim: () => {
        if (pick !== undefined || !prepare()) return undefined;
        const i = worlds!.findIndex((_, i) => !results[i] && !claimed.has(i));
        if (i < 0) return undefined;
        claimed.add(i);
        return {
          world: worlds![i]!,
          give: (result) => {
            if (pick === undefined && !results[i]) results[i] = result;
          },
        };
      },
      result: () => {
        while (search(true));
        return pick!;
      },
    };
  }

  /**
   * The legal choice with the highest value (visit share, weighted across the
   * worlds searched), or a near-tie drawn by value (`variety`).
   */
  private best(
    results: WorldSearch[],
    request: Parameters<typeof toChoice>[1],
    legal: string[],
    rng: Rng,
  ): string | undefined {
    const legalSet = new Set(legal);
    const value = new Map<string, number>();
    for (const { weight, result } of results) {
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
    if (!best) {
      this.note(`no legal engine option (legal: ${legal.join(', ')})`);
      return best;
    }
    const variety = this.options.variety ?? HARD_DEFAULTS.variety;
    if (variety >= 1) return best;
    const ties = legal.filter((c) => (value.get(c) ?? -1) >= variety * bestValue);
    if (ties.length < 2) return best;
    let r = rng() * ties.reduce((sum, c) => sum + value.get(c)!, 0);
    for (const choice of ties) {
      r -= value.get(choice)!;
      if (r < 0) {
        if (choice !== best) this.stats.varied++;
        return choice;
      }
    }
    return best;
  }

  private note(message: string) {
    this.stats.errors.push(message.slice(0, 300));
    if (this.stats.errors.length > 20) this.stats.errors.shift();
  }
}
