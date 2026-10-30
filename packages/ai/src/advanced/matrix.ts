// The advanced coach's game-theoretic root (prototype). Battle turns are
// simultaneous, so instead of reading the choice off MCTS visit counts, each
// sampled world gets a table of our options against the foe's replies (every
// pair played out by MCTS from the next turn on), and the tables are solved
// together as one zero-sum game: a single mix for us, against a foe that
// knows its own world and best-responds in it.
import { sets as defaultSets, type SetsFile } from '@daily-battle/data';
import type { Engine } from '@daily-battle/engine-wasm';
import { legalChoices, type Policy, type Rng, type SideView } from '@daily-battle/sim-bridge';
import { STRONG } from '../presets';
import { UtilityPolicy } from '../policy';
import { toChoice } from '../hard/choices';
import { prepareWorlds } from '../hard/policy';

export interface MatrixOptions {
  engine: Engine;
  data?: SetsFile;
  pool?: readonly string[];
  /** Worlds sampled per decision. */
  worlds?: number;
  /** Iterations of the plain search that picks each side's candidates, per world. */
  screen?: number;
  /** Candidates per side kept for the table. */
  top?: number;
  /** Iterations per table cell. */
  cell?: number;
  /** Mix weights below this are dropped before drawing (0 always plays the mix). */
  floor?: number;
}

export const MATRIX_DEFAULTS = { worlds: 8, screen: 20_000, top: 5, cell: 3_000, floor: 0.1 };

/** One world's table: `value[i][j]` is our option `i` against reply `j`, 0..1 from our view. */
export interface WorldTable {
  weight: number;
  /** Our options, as choices (`move 1`, `switch 3`). */
  ours: string[];
  /** The foe's replies, as the engine names them in this world (`move:0`, `switch:2`). */
  theirs: string[];
  value: number[][];
}

export interface Solution {
  /** Our equilibrium mix over `ours` (the union across worlds). */
  ours: string[];
  mix: number[];
  /** The game's value for us under the mix (0..1). */
  value: number;
  /** Per world, the foe's equilibrium mix over its replies. */
  replies: number[][];
}

/**
 * Solves the worlds' tables as one game by regret matching: our mix is shared,
 * each world's foe has its own. The averaged strategies approach equilibrium.
 */
export function solve(tables: WorldTable[], rounds = 3000): Solution {
  const ours = [...new Set(tables.flatMap((t) => t.ours))];
  const n = ours.length;
  // Every world's table over the shared options. One that isn't a candidate in
  // a world scores as that world's worst row there, so it's never favored for
  // lack of data.
  const full = tables.map((t) => {
    const worst = t.theirs.map((_, j) => Math.min(...t.value.map((row) => row[j]!)));
    return ours.map((c) => {
      const k = t.ours.indexOf(c);
      return k >= 0 ? t.value[k]! : worst;
    });
  });
  const regret = new Array<number>(n).fill(0);
  const sum = new Array<number>(n).fill(0);
  const foeRegret = tables.map((t) => new Array<number>(t.theirs.length).fill(0));
  const foeSum = tables.map((t) => new Array<number>(t.theirs.length).fill(0));
  const strategy = (r: number[]) => {
    const pos = r.map((x) => Math.max(0, x));
    const total = pos.reduce((a, b) => a + b, 0);
    return total > 0 ? pos.map((x) => x / total) : r.map(() => 1 / r.length);
  };
  for (let round = 0; round < rounds; round++) {
    const x = strategy(regret);
    const u = new Array<number>(n).fill(0);
    tables.forEach((t, w) => {
      const a = full[w]!;
      const y = strategy(foeRegret[w]!);
      for (let i = 0; i < n; i++) {
        let v = 0;
        for (let j = 0; j < y.length; j++) v += y[j]! * a[i]![j]!;
        u[i]! += t.weight * v;
      }
      // The foe's payoff is our loss.
      const fu = y.map((_, j) => {
        let v = 0;
        for (let i = 0; i < n; i++) v -= x[i]! * a[i]![j]!;
        return v;
      });
      const fv = fu.reduce((acc, v, j) => acc + v * y[j]!, 0);
      fu.forEach((v, j) => {
        foeRegret[w]![j]! += v - fv;
        foeSum[w]![j]! += y[j]!;
      });
    });
    const ev = u.reduce((acc, v, i) => acc + v * x[i]!, 0);
    u.forEach((v, i) => {
      regret[i]! += v - ev;
      sum[i]! += x[i]!;
    });
  }
  const norm = (s: number[]) => {
    const t = s.reduce((a, b) => a + b, 0);
    return s.map((x) => x / t);
  };
  const mix = norm(sum);
  // The mix's value against each world's best response.
  let value = 0;
  tables.forEach((t, w) => {
    const a = full[w]!;
    let worst = Infinity;
    for (let j = 0; j < t.theirs.length; j++) {
      let v = 0;
      for (let i = 0; i < n; i++) v += mix[i]! * a[i]![j]!;
      worst = Math.min(worst, v);
    }
    value += t.weight * worst;
  });
  return { ours, mix, value, replies: foeSum.map(norm) };
}

export class MatrixPolicy implements Policy {
  readonly stats = { decisions: 0, searched: 0, mixed: 0 };
  private readonly data: SetsFile;
  private readonly fallback: UtilityPolicy;
  private readonly o: typeof MATRIX_DEFAULTS;

  constructor(private readonly options: MatrixOptions) {
    this.data = options.data ?? defaultSets;
    this.fallback = new UtilityPolicy(STRONG, { data: this.data });
    const set = Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined));
    this.o = { ...MATRIX_DEFAULTS, ...set };
  }

  /** Each world's table, from `view`'s side. */
  tables(view: SideView, rng: Rng): WorldTable[] {
    const { engine } = this.options;
    const request = view.request;
    if (request.requestType === 'wait' || request.requestType === 'team') return [];
    const legal = new Set(legalChoices(request));
    const worlds = prepareWorlds(view, this.data, rng, {
      iterations: this.o.screen * this.o.worlds,
      worlds: this.o.worlds,
      ...(this.options.pool ? { pool: this.options.pool } : {}),
    });
    return worlds.map((world) => {
      const screen = engine.search(world.state, this.o.screen, world.seed);
      const opts = engine.options(world.state);
      const rank = (side: { c: string; v: number }[], names: string[]) =>
        names
          .map((c, i) => ({ c, i, v: side.find((o) => o.c === c)?.v ?? 0 }))
          .sort((a, b) => b.v - a.v);
      const ours = rank(screen.s1, opts.s1)
        .filter((o) => {
          const choice = toChoice(o.c, request);
          return choice !== undefined && legal.has(choice);
        })
        .slice(0, this.o.top);
      const theirs = rank(screen.s2, opts.s2).slice(0, this.o.top);
      let seed = world.seed;
      const value = ours.map((a) =>
        theirs.map((b) => {
          seed = (seed + 0x9e3779b9) % 2 ** 52;
          const r = engine.searchPair(world.state, this.o.cell, seed, a.i, b.i);
          const o = r.s1[0];
          return o && o.v ? o.s / o.v : 0.5;
        }),
      );
      return {
        weight: world.weight,
        ours: ours.map((o) => toChoice(o.c, request)!),
        theirs: theirs.map((o) => o.c),
        value,
      };
    });
  }

  choose(view: SideView, rng: Rng): string {
    const legal = legalChoices(view.request);
    if (legal.length <= 1) return legal[0] ?? 'default';
    this.stats.decisions++;
    const type = view.request.requestType;
    if (type === 'team' || type === 'wait') return this.fallback.choose(view, rng);
    try {
      const tables = this.tables(view, rng).filter((t) => t.ours.length && t.theirs.length);
      if (!tables.length) return this.fallback.choose(view, rng);
      const { ours, mix } = solve(tables);
      this.stats.searched++;
      const best = mix.indexOf(Math.max(...mix));
      const kept = mix.map((p) => (p >= this.o.floor ? p : 0));
      let r = rng() * kept.reduce((a, b) => a + b, 0);
      for (let i = 0; i < kept.length; i++) {
        r -= kept[i]!;
        if (r < 0) {
          if (i !== best) this.stats.mixed++;
          return ours[i]!;
        }
      }
      return ours[best]!;
    } catch {
      return this.fallback.choose(view, rng);
    }
  }
}
