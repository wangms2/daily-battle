// The advanced coach's endgame solver (prototype). With few Pokémon left the
// game tree is small, so instead of sampling it with MCTS, each world is
// searched exhaustively a few turns deep (chance weighted exactly) and the
// choice with the best worst case across the worlds is played.
import { sets as defaultSets, type SetsFile } from '@daily-battle/data';
import type { Engine } from '@daily-battle/engine-wasm';
import { legalChoices, type Policy, type Rng, type SideView } from '@daily-battle/sim-bridge';
import { extractState } from '../state';
import { toChoice } from '../hard/choices';
import { prepareWorlds } from '../hard/policy';
import { solve } from './matrix';

export interface EndgameOptions {
  engine: Engine;
  /** Plays every decision the solver doesn't take. */
  inner: Policy;
  data?: SetsFile;
  pool?: readonly string[];
  /** Solve when each side has at most this many Pokémon left… */
  each?: number;
  /** …and the two sides together at most this many. */
  total?: number;
  /** Turns searched. */
  depth?: number;
  worlds?: number;
  /** How a world's table picks: best worst case, or the simultaneous-move equilibrium. */
  rule?: 'maximin' | 'nash';
}

export const ENDGAME_DEFAULTS = {
  each: 3,
  total: 5,
  depth: 2,
  worlds: 8,
  rule: 'maximin' as 'maximin' | 'nash',
};

/** Pokémon left on each side, from `view`'s side. */
export function remaining(view: SideView, data: SetsFile = defaultSets) {
  const s = extractState(view, data);
  return {
    own: s.own.filter((m) => !m.fainted).length,
    foe: s.foeTotal - s.foe.filter((m) => m.fainted).length,
  };
}

/** Our option with the best weight-averaged worst case over the foe's replies. */
export function maximin(
  worlds: { weight: number; ours: string[]; value: number[][] }[],
): string | undefined {
  const score = new Map<string, number>();
  const seen = new Map<string, number>();
  for (const w of worlds)
    w.ours.forEach((c, i) => {
      const worst = Math.min(...w.value[i]!);
      score.set(c, (score.get(c) ?? 0) + w.weight * worst);
      seen.set(c, (seen.get(c) ?? 0) + w.weight);
    });
  const full = Math.max(...seen.values());
  let best: string | undefined;
  let bestScore = -Infinity;
  for (const [c, s] of score) {
    // An option some worlds don't offer is compared on the worlds that do.
    const v = s / (seen.get(c)! / full);
    if (v > bestScore) [best, bestScore] = [c, v];
  }
  return best;
}

export class EndgamePolicy implements Policy {
  readonly stats = { decisions: 0, solved: 0, ms: 0, maxMs: 0 };
  private readonly data: SetsFile;
  private readonly o: typeof ENDGAME_DEFAULTS;

  constructor(private readonly options: EndgameOptions) {
    this.data = options.data ?? defaultSets;
    const set = Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined));
    this.o = { ...ENDGAME_DEFAULTS, ...set };
  }

  applies(view: SideView): boolean {
    const t = view.request.requestType;
    if (t === 'team' || t === 'wait') return false;
    const { own, foe } = remaining(view, this.data);
    return own <= this.o.each && foe <= this.o.each && own + foe <= this.o.total;
  }

  choose(view: SideView, rng: Rng): string {
    this.stats.decisions++;
    const legal = legalChoices(view.request);
    if (legal.length <= 1 || !this.applies(view)) return this.options.inner.choose(view, rng);
    const request = view.request;
    if (request.requestType === 'team' || request.requestType === 'wait')
      return this.options.inner.choose(view, rng);
    try {
      const t0 = performance.now();
      const legalSet = new Set(legal);
      const worlds = prepareWorlds(view, this.data, rng, {
        worlds: this.o.worlds,
        ...(this.options.pool ? { pool: this.options.pool } : {}),
      }).map((world) => {
        const r = this.options.engine.endgame(world.state, this.o.depth);
        const n2 = r.s2.length;
        const rows = r.s1
          .map((c, i) => ({ c: toChoice(c, request), row: r.m.slice(i * n2, (i + 1) * n2) }))
          .filter((x): x is { c: string; row: number[] } => !!x.c && legalSet.has(x.c));
        return { weight: world.weight, ours: rows.map((x) => x.c), value: rows.map((x) => x.row) };
      });
      const solvable = worlds.filter((w) => w.ours.length);
      const pick =
        this.o.rule === 'nash'
          ? (() => {
              const s = solve(
                solvable.map((w) => ({
                  ...w,
                  theirs: w.value[0]!.map((_, j) => String(j)),
                })),
              );
              return s.ours[s.mix.indexOf(Math.max(...s.mix))];
            })()
          : maximin(solvable);
      const ms = performance.now() - t0;
      this.stats.ms += ms;
      this.stats.maxMs = Math.max(this.stats.maxMs, ms);
      if (!pick) return this.options.inner.choose(view, rng);
      this.stats.solved++;
      return pick;
    } catch {
      return this.options.inner.choose(view, rng);
    }
  }
}
