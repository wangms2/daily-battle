// Measures the coach judge's search (docs/plan-tutorial-coach.md, step 2): how
// fast it is, and how often two searches of the same position agree, at each
// budget. Positions are player decisions from Gen 3 battles (a beginner-ish
// player against the daily opponent).
//   pnpm --filter @daily-battle/tutorial judge-bench [--positions 60] [--budgets 5000,10000,20000,40000]
//     [--reference 300000] [--out file.json]
import { writeFileSync } from 'node:fs';
import { aiFor, searchWorlds, toChoice, type Difficulty } from '@daily-battle/ai';
import { setsFor } from '@daily-battle/data';
import { loadEngine } from '@daily-battle/engine-wasm/node';
import {
  addDays,
  generateOpponent,
  generatePool,
  rngFor,
  teamSets,
  toPokemonSet,
} from '@daily-battle/gen';
import {
  BattleSession,
  deriveSeed,
  legalChoices,
  makeRng,
  type SideView,
} from '@daily-battle/sim-bridge';

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const FORMAT = 'gen3ou';
const POSITIONS = Number(arg('positions') ?? 60);
const BUDGETS = (arg('budgets') ?? '5000,10000,20000,40000').split(',').map(Number);
const REFERENCE = Number(arg('reference') ?? 300_000);
const VS = (arg('vs') ?? 'normal') as Difficulty;
const OUT = arg('out');
/** Gaps (in win-chance units, 0–1) a warning would need, to test. */
const MARGINS = [0.05, 0.1, 0.15];
/** Share of the worlds' weight where the alternative must also be ahead. */
const AGREE = 0.9;
const START = '2026-01-05';
const data = setsFor(FORMAT);
const engine = loadEngine(3);
type PokemonSet = ReturnType<typeof toPokemonSet>;

function poolTeam(i: number, week: string): PokemonSet[] {
  const rng = rngFor(`judge-bench:pool-team:${i}`);
  const species = [...generatePool(week, data).species];
  const team: PokemonSet[] = [];
  for (let k = 0; k < 6; k++) {
    const name = species.splice(Math.floor(rng() * species.length), 1)[0]!;
    const options = data.species[name]!.sets;
    let r = rng();
    const set = options.find((s) => (r -= s.weight) < 0) ?? options[options.length - 1]!;
    team.push(toPokemonSet(name, set));
  }
  return team;
}

/** The judge on one pick: the alternative it would warn for, the value gap, and the share of worlds agreeing. */
interface Verdict {
  ms: number;
  /** The open search's choice (most visited, weighted over worlds). */
  top?: string;
  /** Fixed-search values (win chance, 0–1) of the pick and the top choice, weighted over worlds. */
  gap: number;
  agree: number;
}

function judge(
  view: SideView,
  chosen: string,
  iterations: number,
  seed: number,
  pool: readonly string[],
): Verdict {
  const request = view.request;
  const legal = new Set(legalChoices(request));
  const t0 = performance.now();
  const rng = () => makeRng(deriveSeed('judge', seed));
  const visits: Record<string, number> = {};
  for (const { weight, result } of searchWorlds(engine, view, data, rng(), { iterations, pool }))
    for (const o of result.s1) {
      const c = request.requestType === 'wait' ? undefined : toChoice(o.c, request);
      if (c && legal.has(c) && result.n) visits[c] = (visits[c] ?? 0) + (weight * o.v) / result.n;
    }
  const top = Object.entries(visits).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!top || top === chosen) return { ms: performance.now() - t0, top, gap: 0, agree: 0 };
  // The same worlds and luck for both (the same rng seed).
  const valued = (fixed: string) =>
    searchWorlds(engine, view, data, rng(), { iterations, pool, fixed }).map(
      ({ weight, result }) => ({
        weight,
        v: result.s1[0] && result.s1[0].v ? result.s1[0].s / result.s1[0].v : undefined,
      }),
    );
  const a = valued(top);
  const b = valued(chosen);
  let gap = 0;
  let total = 0;
  let ahead = 0;
  a.forEach((w, i) => {
    const vb = b[i]?.v;
    if (w.v === undefined || vb === undefined) return;
    total += w.weight;
    gap += w.weight * (w.v - vb);
    if (w.v > vb) ahead += w.weight;
  });
  return {
    ms: performance.now() - t0,
    top,
    gap: total ? gap / total : 0,
    agree: total ? ahead / total : 0,
  };
}

/** Whether the judge would warn: a clear gap, ahead in nearly every world. */
const warns = (v: Verdict, margin: number) => v.gap >= margin && v.agree >= AGREE;

interface Row {
  budget: number;
  ms: number[];
  bestAgree: number;
  bestMatchesRef: number;
  /** Per margin: warnings in run 1, in run 2, flips (one warns, the other doesn't or names another), and agreement with the reference. */
  flags: Record<
    number,
    { run1: number; run2: number; flips: number; refAgree: number; refFlags: number }
  >;
}

const rows: Row[] = BUDGETS.map((budget) => ({
  budget,
  ms: [],
  bestAgree: 0,
  bestMatchesRef: 0,
  flags: Object.fromEntries(
    MARGINS.map((m) => [m, { run1: 0, run2: 0, flips: 0, refAgree: 0, refFlags: 0 }]),
  ),
}));
const refMs: number[] = [];

let positions = 0;
const t0 = performance.now();
for (let i = 0; positions < POSITIONS; i++) {
  const week = addDays(START, 7 * Math.floor(i / 7));
  const day = addDays(week, i % 7);
  const opp = generateOpponent(day, data);
  const pool = generatePool(week, data).species;
  const session = new BattleSession({
    format: FORMAT,
    seed: deriveSeed('judge-bench:battle', i),
    p1: { team: poolTeam(i, week) },
    p2: { team: teamSets(data, opp.team) },
  });
  const player = aiFor({ difficulty: 'easy', style: 'balance', data });
  const foe = aiFor({ difficulty: VS, style: opp.style, data });
  const rngs = {
    p1: makeRng(deriveSeed('judge-bench:p1', i)),
    p2: makeRng(deriveSeed('judge-bench:p2', i)),
  };
  let taken = 0;
  while (!session.ended) {
    for (const side of ['p1', 'p2'] as const) {
      const view = session.view(side);
      if (!view || session.ended) continue;
      const choice = (side === 'p1' ? player : foe).choose(view, rngs[side]);
      // A few real decisions per battle (at least two options), spread over the battle.
      if (
        side === 'p1' &&
        view.request.requestType === 'move' &&
        legalChoices(view.request).length > 1 &&
        taken < 4 &&
        session.turn % 3 === 1 &&
        positions < POSITIONS
      ) {
        taken++;
        positions++;
        const ref = judge(view, choice, REFERENCE, positions * 1000, pool);
        refMs.push(ref.ms);
        for (const row of rows) {
          const a = judge(view, choice, row.budget, positions * 1000 + 1, pool);
          const b = judge(view, choice, row.budget, positions * 1000 + 2, pool);
          row.ms.push(a.ms, b.ms);
          if (a.top === b.top) row.bestAgree++;
          if (a.top === ref.top) row.bestMatchesRef++;
          for (const m of MARGINS) {
            const f = row.flags[m]!;
            const va = warns(a, m) ? a.top : undefined;
            const vb = warns(b, m) ? b.top : undefined;
            const vr = warns(ref, m) ? ref.top : undefined;
            if (va) f.run1++;
            if (vb) f.run2++;
            if (va !== vb) f.flips++;
            if (va === vr) f.refAgree++;
            if (vr) f.refFlags++;
          }
        }
        if (positions % 10 === 0)
          console.log(
            `  ${positions}/${POSITIONS} positions (${((performance.now() - t0) / 1000).toFixed(0)}s)`,
          );
      }
      if (!session.choose(side, choice)) continue;
    }
  }
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
const p90 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.9)] ?? 0;
const pct = (n: number) => `${((100 * n) / positions).toFixed(0)}%`;
console.log(
  `\n${positions} positions (easy player vs ${VS}), 2 judges per budget (open search + 2 fixed searches each), reference ${REFERENCE} iterations (median ${median(refMs).toFixed(0)} ms)`,
);
for (const row of rows) {
  console.log(
    `\n${row.budget} iterations: median ${median(row.ms).toFixed(0)} ms, p90 ${p90(row.ms).toFixed(0)} ms (this machine)` +
      `\n  same best choice in both runs: ${pct(row.bestAgree)}; matches the reference: ${pct(row.bestMatchesRef)}`,
  );
  for (const m of MARGINS) {
    const f = row.flags[m]!;
    console.log(
      `  margin ${m}: warns on ${pct(f.run1)} / ${pct(f.run2)} of picks, flips ${pct(f.flips)}, agrees with reference ${pct(f.refAgree)} (reference warns on ${pct(f.refFlags)})`,
    );
  }
}
if (OUT) writeFileSync(OUT, JSON.stringify({ positions, rows, refMs }, null, 1));
