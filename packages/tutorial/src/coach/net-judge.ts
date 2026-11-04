// The coach's judge on Master's brain (DESIGN.md §22): the network search,
// from the player's view, scores every legal choice in a few sampled worlds
// (the foe's hidden sets filled in from the public set data, as for Master).
// A choice is clearly worse when the top choice's win chance beats it by
// `margin` overall and it's ahead in at least `agree` of the worlds (by
// weight), as for the search judge (judge.ts).
//
// Every legal choice is searched (`must`), with the foe's likely replies at
// the root, so the same search also scores each choice against each reply
// (`against`: the foe read on Easy and Normal).
//
// The work is one search per world, so the battle worker can run it a slice
// at a time while the player chooses.
import { MASTER_DEFAULTS, NetPolicy, pickSearched, type NetPrepared } from '@daily-battle/ai';
import type { SetsFile } from '@daily-battle/data';
import type { Engine, NetSearchParams, NetSearchResult } from '@daily-battle/engine-wasm';
import { deriveSeed, legalChoices, makeRng, type SideView } from '@daily-battle/sim-bridge';
import {
  agreement,
  replyKey,
  type CoachJudge,
  type FoeRead,
  type JudgeOptions,
  type ReadValue,
  type Verdict,
} from './judge';

export interface NetJudgeOptions extends Pick<
  JudgeOptions,
  'margin' | 'agree' | 'tie' | 'pool' | 'knownSets'
> {
  /** Worlds sampled per decision. */
  worlds: number;
  search: NetSearchParams;
}

/**
 * Set by coach-eval --judge both (vs Normal and Hard): the network's gaps run about
 * half the search's, and at 0.07 its warnings gained as much or more, with no clearly
 * wrong ones.
 */
export const NET_JUDGE_DEFAULTS: NetJudgeOptions = {
  worlds: MASTER_DEFAULTS.worlds,
  search: MASTER_DEFAULTS.search,
  margin: 0.07,
  agree: 0.9,
};

const speciesId = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export class NetJudge implements CoachJudge {
  private readonly options: NetJudgeOptions;
  private readonly policy: NetPolicy;
  private legal = new Set<string>();
  private prepared?: NetPrepared;
  /** Each world's search (null: the engine failed on it). */
  private results: (NetSearchResult | null)[] = [];
  /** Each world's foe reply keys, by the foe's slot. */
  private replyKeys: (string | undefined)[][] = [];
  private queue: number[] = [];
  private top?: string;
  private failed = false;

  constructor(
    private readonly engine: Engine,
    data: SetsFile,
    options: Partial<NetJudgeOptions> = {},
  ) {
    this.options = { ...NET_JUDGE_DEFAULTS, ...options };
    this.policy = new NetPolicy({
      engine,
      data,
      worlds: this.options.worlds,
      ...(this.options.pool ? { pool: this.options.pool } : {}),
      ...(this.options.knownSets ? { knownSets: this.options.knownSets } : {}),
    });
  }

  /**
   * Sees a decision it won't judge (a replayed one on resume): the network's
   * inputs (Speed evidence, team order) come from every decision.
   */
  watch(view: SideView): void {
    this.policy.watch(view);
  }

  /**
   * Starts judging a new decision. `key` seeds the worlds, so the same
   * decision (a resume, say) gets the same verdicts.
   */
  begin(view: SideView, key: string): void {
    this.legal = new Set(legalChoices(view.request));
    this.prepared = undefined;
    this.results = [];
    this.replyKeys = [];
    this.queue = [];
    this.top = undefined;
    this.failed = false;
    if (view.request.requestType !== 'move' || this.legal.size < 2) {
      this.policy.watch(view);
      return;
    }
    try {
      this.prepared = this.policy.prepare(view, makeRng(deriveSeed(`coach:${key}`, 0)));
    } catch {
      // An engine error: no verdicts for this decision, so the coach stays quiet.
    }
    if (!this.prepared) {
      this.failed = true;
      return;
    }
    const foeSide = view.side === 'p1' ? 'p2' : 'p1';
    const active = view.battle[foeSide].active[0]?.speciesForme;
    this.replyKeys = this.prepared.foes.map((foes) => {
      const keys: (string | undefined)[] = [];
      const on = foes.find((f) => active && speciesId(f.species) === speciesId(active));
      on?.set.moves.forEach((m, i) => {
        keys[i] = replyKey('move', m);
        keys[4 + i] = replyKey('move', m);
      });
      foes.forEach((f, i) => (keys[8 + i] = replyKey('switch', f.species)));
      return keys;
    });
    this.queue = this.prepared.worlds.map((_, k) => k);
  }

  /** The top choice, once every world is searched. */
  get best(): string | undefined {
    return this.failed ? undefined : this.top;
  }

  /** Whether there's work left for this decision. */
  get busy(): boolean {
    return !this.failed && this.queue.length > 0;
  }

  /** Searches one world. Returns false when there's nothing left to do. */
  step(): boolean {
    const k = this.queue.shift();
    const p = this.prepared;
    if (k === undefined || this.failed || !p) return false;
    const world = p.worlds[k]!;
    try {
      this.results[k] = this.engine.netSearch(this.options.search, [
        { ...world, must: world.legal },
      ])[0]!;
    } catch {
      this.results[k] = null;
    }
    if (!this.queue.length) this.finish();
    return this.queue.length > 0;
  }

  private finish() {
    const p = this.prepared!;
    const kept = this.kept();
    this.top = kept.length
      ? pickSearched(
          p.legal,
          kept.map((k) => p.slots[k]!),
          kept.map((k) => p.weights[k]!),
          kept.map((k) => this.results[k]!),
          MASTER_DEFAULTS.priorWeight,
        )
      : undefined;
    if (!this.top) this.failed = true;
  }

  /** Worlds whose search ran. */
  private kept(): number[] {
    return this.results.flatMap((r, k) => (r ? [k] : []));
  }

  /** `choice`'s slot in world `k` (undefined: not offered there). */
  private slot(k: number, choice: string): number | undefined {
    const i = this.prepared!.slots[k]!.indexOf(choice);
    return i < 0 ? undefined : i;
  }

  /** The verdict on `choice`, or undefined while it isn't ready (or the search failed). */
  verdict(choice: string): Verdict | undefined {
    if (this.failed || !this.top || !this.legal.has(choice)) return undefined;
    const top = this.top;
    const tops: number[] = [];
    const picks: number[] = [];
    const weights: number[] = [];
    for (const k of this.kept()) {
      const r = this.results[k]!;
      const a = this.slot(k, top);
      const b = this.slot(k, choice);
      const va = a === undefined ? NaN : r.score[a]!;
      const vb = b === undefined ? NaN : r.score[b]!;
      if (!Number.isFinite(va) || !Number.isFinite(vb)) continue;
      tops.push(va);
      picks.push(vb);
      weights.push(this.prepared!.weights[k]!);
    }
    const total = weights.reduce((s, w) => s + w, 0);
    if (!total) return { choice, top, worse: false, gap: 0, agree: 0, value: 0, topValue: 0 };
    const mean = (xs: number[]) => xs.reduce((s, x, i) => s + x * weights[i]!, 0) / total;
    const value = mean(picks);
    const topValue = mean(tops);
    const agree = agreement(tops, picks, weights, this.options.tie ?? 0);
    const gap = topValue - value;
    return {
      choice,
      top,
      gap,
      agree,
      value,
      topValue,
      worse: choice !== top && gap >= this.options.margin && agree >= this.options.agree,
    };
  }

  /**
   * How `choices` (every legal one by default) fare against a foe read, from
   * the searches' replies; undefined until every world is searched. A reply
   * counts in a world only where the search tried it; replies with no such
   * world count at each choice's overall value.
   */
  against(
    read: FoeRead,
    choices: readonly string[] = [...this.legal],
  ): Record<string, ReadValue> | undefined {
    if (this.failed || !this.top || !choices.length) return undefined;
    const p = this.prepared!;
    const kept = this.kept();
    const overall = choices.map((c) => {
      let total = 0;
      let sum = 0;
      for (const k of kept) {
        const i = this.slot(k, c);
        const s = i === undefined ? NaN : this.results[k]!.score[i]!;
        if (!Number.isFinite(s)) continue;
        total += p.weights[k]!;
        sum += p.weights[k]! * s;
      }
      return total ? sum / total : 0;
    });
    const valueOf = (reply: string): number[] | undefined => {
      let total = 0;
      const sums = choices.map(() => 0);
      for (const k of kept) {
        const r = this.results[k]!.replies.find(
          (x) => x.slot !== null && this.replyKeys[k]![x.slot] === reply,
        );
        if (!r) continue;
        const q = choices.map((c) => {
          const i = this.slot(k, c);
          return i === undefined ? NaN : r.q[i]!;
        });
        if (!q.every(Number.isFinite)) continue;
        total += p.weights[k]!;
        q.forEach((v, i) => (sums[i]! += p.weights[k]! * v));
      }
      return total ? sums.map((s) => s / total) : undefined;
    };
    const actual = read.actual ? valueOf(read.actual) : undefined;
    let mass = 0;
    const expected = choices.map(() => 0);
    for (const [reply, odds] of Object.entries(read.likely)) {
      if (!(odds > 0)) continue;
      const v = valueOf(reply);
      mass += odds;
      choices.forEach((_, i) => (expected[i]! += odds * (v?.[i] ?? overall[i]!)));
    }
    return Object.fromEntries(
      choices.map((c, i) => [
        c,
        {
          expected: mass ? expected[i]! / mass : overall[i]!,
          ...(actual ? { actual: actual[i]! } : {}),
        },
      ]),
    );
  }

  /**
   * Works until the verdict on `choice` is ready or `ms` milliseconds pass
   * (the "Coach is checking…" hold). Undefined if it isn't ready in time.
   */
  settle(
    choice: string,
    ms: number,
    now: () => number = () => performance.now(),
  ): Verdict | undefined {
    const end = now() + ms;
    for (;;) {
      const v = this.verdict(choice);
      if (v || this.failed || !this.queue.length) return v;
      if (now() >= end) return undefined;
      this.step();
    }
  }
}
