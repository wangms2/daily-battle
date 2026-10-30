// The advanced coach's budget spender (prototype): successive halving at the
// root. Every candidate gets a share of the first round; each round drops the
// weaker half and searches the rest again with the next share, so the budget
// ends up on the real contenders. The foe's root is never narrowed, and it
// still replies without seeing our choice. A round that leaves one candidate
// clearly ahead ends the decision early.
import { sets as defaultSets, type SetsFile } from '@daily-battle/data';
import type { Engine } from '@daily-battle/engine-wasm';
import { legalChoices, type Policy, type Rng, type SideView } from '@daily-battle/sim-bridge';
import { STRONG } from '../presets';
import { UtilityPolicy } from '../policy';
import { toChoice } from '../hard/choices';
import { prepareWorlds } from '../hard/policy';

export interface HalvingOptions {
  engine: Engine;
  data?: SetsFile;
  pool?: readonly string[];
  /** Total iterations per decision (an early stop spends less). */
  iterations?: number;
  worlds?: number;
  /** Stop once the leader's combined visit share reaches this (1 never stops early). */
  stop?: number;
}

export const HALVING_DEFAULTS = { iterations: 150_000, worlds: 8, stop: 1 };

export class HalvingPolicy implements Policy {
  readonly stats = { decisions: 0, searched: 0, rounds: 0, early: 0, iterations: 0 };
  private readonly data: SetsFile;
  private readonly fallback: UtilityPolicy;
  private readonly o: typeof HALVING_DEFAULTS;

  constructor(private readonly options: HalvingOptions) {
    this.data = options.data ?? defaultSets;
    this.fallback = new UtilityPolicy(STRONG, { data: this.data });
    const set = Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined));
    this.o = { ...HALVING_DEFAULTS, ...set };
  }

  choose(view: SideView, rng: Rng): string {
    const legal = legalChoices(view.request);
    if (legal.length <= 1) return legal[0] ?? 'default';
    this.stats.decisions++;
    const request = view.request;
    if (request.requestType === 'team' || request.requestType === 'wait')
      return this.fallback.choose(view, rng);
    try {
      const { engine } = this.options;
      const legalSet = new Set(legal);
      const worlds = prepareWorlds(view, this.data, rng, {
        iterations: this.o.iterations,
        worlds: this.o.worlds,
        ...(this.options.pool ? { pool: this.options.pool } : {}),
      }).map((w) => ({
        ...w,
        // Each engine option's choice in this world (undefined if not legal).
        choices: engine.options(w.state).s1.map((c) => {
          const choice = toChoice(c, request);
          return choice && legalSet.has(choice) ? choice : undefined;
        }),
      }));
      let alive = legal.filter((c) => worlds.some((w) => w.choices.includes(c)));
      if (!alive.length) return this.fallback.choose(view, rng);
      const rounds = Math.max(1, Math.ceil(Math.log2(alive.length)));
      const perRound = this.o.iterations / rounds;
      let leader = alive[0]!;
      for (let round = 0; round < rounds && alive.length > 1; round++) {
        this.stats.rounds++;
        const value = new Map<string, number>(alive.map((c) => [c, 0]));
        for (const w of worlds) {
          let mask = 0;
          w.choices.forEach((c, i) => {
            if (c && alive.includes(c) && i < 32) mask |= 1 << i;
          });
          if (!mask) continue;
          const n = Math.max(1000, Math.round(perRound * w.weight));
          const r = engine.searchSubset(w.state, n, w.seed + round, mask >>> 0);
          this.stats.iterations += r.n;
          const names = engine.options(w.state).s1;
          for (const o of r.s1) {
            const c = w.choices[names.indexOf(o.c)];
            if (c && r.n) value.set(c, value.get(c)! + (w.weight * o.v) / r.n);
          }
        }
        // Legal order breaks ties.
        const ranked = [...alive].sort((a, b) => value.get(b)! - value.get(a)!);
        leader = ranked[0]!;
        const total = [...value.values()].reduce((a, b) => a + b, 0);
        if (total > 0 && value.get(leader)! / total >= this.o.stop) {
          this.stats.early++;
          break;
        }
        alive = ranked.slice(0, Math.ceil(ranked.length / 2));
      }
      this.stats.searched++;
      return alive.length === 1 ? alive[0]! : leader;
    } catch {
      return this.fallback.choose(view, rng);
    }
  }
}
