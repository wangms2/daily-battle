// The coach's judge (DESIGN.md §22): the Hard search, run from the player's
// own view, decides whether a choice is clearly worse than the best one. The
// coach only warns when it does. It never sees the foe's real sets: their
// hidden sets are sampled into worlds from the public set data, as Hard does.
//
// A judgment is three kinds of search over the same worlds and luck:
//   1. an open search over every choice, which names the top choice;
//   2. a search held to the top choice;
//   3. a search held to the choice being judged.
// The held searches give each choice the full budget, so a choice the open
// search rarely tried isn't scored on too few samples. The judged choice is
// clearly worse when the top choice's value beats it by `margin` overall and
// it's ahead in at least `agree` of the worlds (by weight): better in the bad
// cases too, not just on average.
//
// The work is a queue of one-world searches, so the battle worker can run it a
// slice at a time while the player chooses.
import { prepareWorlds, searchWorld, toChoice, type PreparedWorld } from '@daily-battle/ai';
import type { SetsFile } from '@daily-battle/data';
import type { Engine, SearchResult } from '@daily-battle/engine-wasm';
import { deriveSeed, legalChoices, makeRng, type SideView } from '@daily-battle/sim-bridge';

export interface JudgeOptions {
  /** Iterations per search, split across the worlds. */
  iterations: number;
  /** Worlds sampled per decision. */
  worlds: number;
  /** The value gap (win chance, 0–1) that makes a choice clearly worse. */
  margin: number;
  /** The share of worlds (by weight) where the top choice must be ahead. */
  agree: number;
  /** The week's pool: the prior for foes not seen yet. */
  pool?: readonly string[];
}

/** Provisional until the offline check (docs/plan-tutorial-coach.md, step 2). */
export const JUDGE_DEFAULTS: JudgeOptions = {
  iterations: 20_000,
  worlds: 8,
  margin: 0.1,
  agree: 0.9,
};

export interface Verdict {
  /** The choice judged. */
  choice: string;
  /** The open search's top choice. */
  top: string;
  /** Whether `choice` is clearly worse than `top`. */
  worse: boolean;
  /** Top's value minus the choice's, weighted over the worlds. */
  gap: number;
  /** The share of the worlds' weight where top is ahead. */
  agree: number;
}

type Task = { world: number; fixed?: string };

/** Each choice's value (win chance, 0–1) for the searching side, from a search's root options. */
function values(result: SearchResult, request: SideView['request']): Record<string, number> {
  const out: Record<string, number> = {};
  if (request.requestType === 'wait' || request.requestType === 'team') return out;
  for (const o of result.s1) {
    const c = toChoice(o.c, request);
    if (c && o.v > 0) out[c] = o.s / o.v;
  }
  return out;
}

export class Judge {
  private readonly options: JudgeOptions;
  private request?: SideView['request'];
  private legal = new Set<string>();
  private worlds: PreparedWorld[] = [];
  private queue: Task[] = [];
  /** Open search: each choice's visit share per world. */
  private open: (Record<string, number> | undefined)[] = [];
  /** Held searches: the held choice's value per world. */
  private held = new Map<string, (number | null | undefined)[]>();
  private top?: string;
  private failed = false;

  constructor(
    private readonly engine: Engine,
    private readonly data: SetsFile,
    options: Partial<JudgeOptions> = {},
  ) {
    this.options = { ...JUDGE_DEFAULTS, ...options };
  }

  /**
   * Starts judging a new decision. `key` seeds the worlds and the searches, so
   * the same decision (a resume, say) gets the same verdicts. `first` lists
   * choices to judge before the others (those a rule would explain).
   */
  begin(view: SideView, key: string, first: readonly string[] = []): void {
    this.request = view.request;
    this.legal = new Set(legalChoices(view.request));
    this.queue = [];
    this.open = [];
    this.held = new Map();
    this.top = undefined;
    this.failed = false;
    this.worlds = [];
    if (view.request.requestType !== 'move' || this.legal.size < 2) return;
    try {
      this.worlds = prepareWorlds(view, this.data, makeRng(deriveSeed(`coach:${key}`, 0)), {
        iterations: this.options.iterations,
        worlds: this.options.worlds,
        ...(this.options.pool ? { pool: this.options.pool } : {}),
      });
    } catch {
      this.failed = true;
      return;
    }
    this.queue = this.worlds.map((_, world) => ({ world }));
    this.first = first.filter((c) => this.legal.has(c));
  }

  /** Choices to judge first, once the top choice is known. */
  private first: string[] = [];

  /** Whether there's work left for this decision. */
  get busy(): boolean {
    return !this.failed && this.queue.length > 0;
  }

  /** Runs one world's search. Returns false when there's nothing left to do. */
  step(): boolean {
    const task = this.queue.shift();
    if (!task || this.failed || !this.request) return false;
    const world = this.worlds[task.world]!;
    let result: SearchResult;
    try {
      result = searchWorld(this.engine, this.request, world, task.fixed);
    } catch {
      // An engine error: no verdicts for this decision, so the coach stays quiet.
      this.failed = true;
      this.queue = [];
      return false;
    }
    if (task.fixed === undefined) {
      const share: Record<string, number> = {};
      for (const o of result.s1) {
        const c = this.request.requestType === 'move' ? toChoice(o.c, this.request) : undefined;
        if (c && this.legal.has(c) && result.n) share[c] = o.v / result.n;
      }
      this.open[task.world] = share;
      if (this.open.filter(Boolean).length === this.worlds.length) this.planHeld();
    } else {
      const list = this.held.get(task.fixed) ?? [];
      list[task.world] = values(result, this.request)[task.fixed] ?? null;
      this.held.set(task.fixed, list);
    }
    return this.queue.length > 0;
  }

  /** After the open search: the top choice, then the held searches, `first` choices before the rest. */
  private planHeld() {
    const visits: Record<string, number> = {};
    this.open.forEach((share, i) => {
      for (const [c, v] of Object.entries(share ?? {}))
        visits[c] = (visits[c] ?? 0) + this.worlds[i]!.weight * v;
    });
    // Legal order breaks ties, so the top doesn't depend on map order.
    let best = -1;
    for (const c of this.legal)
      if ((visits[c] ?? -1) > best) {
        best = visits[c] ?? -1;
        this.top = c;
      }
    if (!this.top) {
      this.failed = true;
      return;
    }
    const order = [this.top, ...this.first, ...this.legal].filter(
      (c, i, all) => all.indexOf(c) === i,
    );
    for (const fixed of order)
      for (let world = 0; world < this.worlds.length; world++) this.queue.push({ world, fixed });
  }

  /** Moves a choice's searches (and the top's) to the front of the queue. */
  private hurry(choice: string) {
    const urgent = (t: Task) => t.fixed === undefined || t.fixed === this.top || t.fixed === choice;
    this.queue = [...this.queue.filter(urgent), ...this.queue.filter((t) => !urgent(t))];
  }

  /** The verdict on `choice`, or undefined while it isn't ready (or the search failed). */
  verdict(choice: string): Verdict | undefined {
    if (this.failed || !this.top || !this.legal.has(choice)) return undefined;
    if (choice === this.top) return { choice, top: this.top, worse: false, gap: 0, agree: 0 };
    const a = this.held.get(this.top);
    const b = this.held.get(choice);
    if (!a || !b) return undefined;
    let total = 0;
    let gap = 0;
    let ahead = 0;
    for (let w = 0; w < this.worlds.length; w++) {
      const va = a[w];
      const vb = b[w];
      if (va === undefined || vb === undefined) return undefined; // not searched yet
      if (va === null || vb === null) continue;
      const weight = this.worlds[w]!.weight;
      total += weight;
      gap += weight * (va - vb);
      if (va > vb) ahead += weight;
    }
    if (!total) return { choice, top: this.top, worse: false, gap: 0, agree: 0 };
    const v = { choice, top: this.top, gap: gap / total, agree: ahead / total };
    return { ...v, worse: v.gap >= this.options.margin && v.agree >= this.options.agree };
  }

  /**
   * Works on `choice` until its verdict is ready or `ms` milliseconds pass
   * (the "Coach is checking…" hold). Undefined if it isn't ready in time.
   */
  settle(
    choice: string,
    ms: number,
    now: () => number = () => performance.now(),
  ): Verdict | undefined {
    const end = now() + ms;
    this.hurry(choice);
    for (;;) {
      const v = this.verdict(choice);
      if (v || this.failed || !this.queue.length) return v;
      if (now() >= end) return undefined;
      this.step();
      // The top may have just been found: put the choice's searches first.
      if (this.top) this.hurry(choice);
    }
  }
}
