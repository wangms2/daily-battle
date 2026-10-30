// The advanced coach's strength gate: a search budget (the challenger) plays
// Hard head to head on daily-format matchups, each played from both sides.
//   pnpm --filter @daily-battle/ai strength-gate [--formats gen3ou,gen4ou,gen5ou,gen6ou]
//     [--n 100] [--jobs 18] [--a 1000000x32] [--b 150000x8] [--start 2026-03-02]
// `--a`/`--b` are `<iterations>x<worlds>`; `--b` defaults to Hard's own budget.
// Pass (the plan): >= 60% pooled, with each gen's 95% interval above 50%.
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FORMATS, setsFor } from '@daily-battle/data';
import {
  addDays,
  generateOpponent,
  generatePool,
  rngFor,
  teamSets,
  toPokemonSet,
} from '@daily-battle/gen';
import { engineBuilt, loadEngine } from '@daily-battle/engine-wasm/node';
import type { Engine } from '@daily-battle/engine-wasm';
import { deriveSeed, runBattle, type Policy } from '@daily-battle/sim-bridge';
import { HARD_DEFAULTS, HardPolicy } from '../src/index';

type PokemonSet = ReturnType<typeof toPokemonSet>;

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const budget = (s: string | undefined, d: { iterations: number; worlds: number }) => {
  if (!s) return d;
  const [it, w] = s.split('x').map(Number);
  return { iterations: it!, worlds: w ?? d.worlds };
};
/** `--a-boost 2,linear,foe`: a side's evaluation boost weights (default: the engine's DEFAULT_BOOST_EVAL; `1` is upstream's). */
const boostOf = (s: string | undefined) => {
  if (!s) return undefined;
  const [scale, ...flags] = s.split(',');
  return { scale: Number(scale), linear: flags.includes('linear'), foe: flags.includes('foe') };
};
const A_BOOST = boostOf(arg('a-boost'));
/** `--a-variety 0.9`: a side's near-tie band (HardPolicyOptions.variety). */
const varietyOf = (s: string | undefined) => (s ? { variety: Number(s) } : {});
const B_BOOST = boostOf(arg('b-boost'));
const FORMAT_IDS = (arg('formats') ?? Object.keys(FORMATS).join(',')).split(',');
const N = Number(arg('n') ?? 100);
const JOBS = Number(arg('jobs') ?? 1);
const A = {
  ...budget(arg('a'), { iterations: 1_000_000, worlds: 32 }),
  ...varietyOf(arg('a-variety')),
};
const B = { ...budget(arg('b'), HARD_DEFAULTS), ...varietyOf(arg('b-variety')) };
const START = arg('start') ?? '2026-03-02';

interface Task {
  format: string;
  i: number;
  /** The challenger plays the daily opponent's team (p2) instead of the pool team (p1). */
  swap: boolean;
}
interface Outcome extends Task {
  /** 1 challenger won, 0 lost, 0.5 tie. */
  score: number;
  turns: number;
  msA: number;
  decA: number;
  msB: number;
  decB: number;
  /** The challenger's searched decisions, and those where a near-tie was drawn. */
  searchedA: number;
  variedA: number;
}

function poolTeam(format: string, i: number, week: string): PokemonSet[] {
  const sets = setsFor(format);
  const rng = rngFor(`gate:pool-team:${format}:${i}`);
  const species = [...generatePool(week, sets).species];
  const team: PokemonSet[] = [];
  for (let k = 0; k < 6; k++) {
    const name = species.splice(Math.floor(rng() * species.length), 1)[0]!;
    const options = sets.species[name]!.sets;
    let r = rng();
    const set = options.find((s) => (r -= s.weight) < 0) ?? options[options.length - 1]!;
    team.push(toPokemonSet(name, set));
  }
  return team;
}

const engines = new Map<string, Engine>();
function engineFor(format: string, side: 'a' | 'b'): Engine {
  const gen = FORMATS[format as keyof typeof FORMATS].gen;
  if (!engineBuilt(gen)) throw new Error(`no engine for ${format}: run build:wasm first`);
  const key = `${gen}:${side}`;
  let e = engines.get(key);
  if (!e) {
    engines.set(key, (e = loadEngine(gen)));
    const boost = side === 'a' ? A_BOOST : B_BOOST;
    if (boost) e.setBoostEval(boost.scale, boost.linear, boost.foe);
  }
  return e;
}

function timed(policy: Policy, t: { ms: number; n: number }): Policy {
  return {
    choose(view, rng) {
      const t0 = performance.now();
      const c = policy.choose(view, rng);
      t.ms += performance.now() - t0;
      t.n++;
      return c;
    },
  };
}

function playTask({ format, i, swap }: Task): Outcome {
  const sets = setsFor(format);
  const week = addDays(START, 7 * Math.floor(i / 7));
  const day = addDays(week, i % 7);
  const pool = generatePool(week, sets).species;
  const mine = poolTeam(format, i, week);
  const daily = teamSets(sets, generateOpponent(day, sets).team);
  const ta = { ms: 0, n: 0 };
  const tb = { ms: 0, n: 0 };
  const hardA = new HardPolicy({ engine: engineFor(format, 'a'), data: sets, pool, ...A });
  const a = timed(hardA, ta);
  const b = timed(new HardPolicy({ engine: engineFor(format, 'b'), data: sets, pool, ...B }), tb);
  // Same battle seed both ways round, so each matchup's luck is mirrored.
  const result = runBattle({
    format,
    seed: deriveSeed(`gate:${format}:battle`, i),
    p1: { team: mine, policy: swap ? b : a, seed: deriveSeed(`gate:p1`, i) },
    p2: { team: daily, policy: swap ? a : b, seed: deriveSeed(`gate:p2`, i) },
  });
  const challenger = swap ? 'p2' : 'p1';
  const score = result.winner === null ? 0.5 : result.winner === challenger ? 1 : 0;
  return {
    format,
    i,
    swap,
    score,
    turns: result.turns,
    msA: ta.ms,
    decA: ta.n,
    msB: tb.ms,
    decB: tb.n,
    searchedA: hardA.stats.searched,
    variedA: hardA.stats.varied,
  };
}

const child = process.argv.indexOf('--child');
if (child > 0) {
  const [shard, jobs] = process.argv.slice(child + 1).map(Number);
  const tasks = JSON.parse(process.env.GATE_TASKS!) as Task[];
  for (let k = shard!; k < tasks.length; k += jobs!) process.send!(playTask(tasks[k]!));
  process.exit(0);
}

const tasks: Task[] = FORMAT_IDS.flatMap((format) =>
  Array.from({ length: N }, (_, i) => [
    { format, i, swap: false },
    { format, i, swap: true },
  ]).flat(),
);
console.log(
  `strength gate: ${A.iterations}x${A.worlds}${arg('a-boost') ? ` boost ${arg('a-boost')}` : ''} vs ` +
    `${B.iterations}x${B.worlds}${arg('b-boost') ? ` boost ${arg('b-boost')}` : ''}, ` +
    `${FORMAT_IDS.join(',')}, ${N} matchups x 2 sides, ${JOBS} job(s)`,
);
const t0 = performance.now();
const outcomes: Outcome[] = [];
const report = (o: Outcome) => {
  outcomes.push(o);
  if (outcomes.length % 20 === 0)
    console.log(
      `  ${outcomes.length}/${tasks.length} battles, ${((performance.now() - t0) / 60000).toFixed(1)} min`,
    );
};
if (JOBS <= 1) tasks.forEach((t) => report(playTask(t)));
else {
  const self = fileURLToPath(import.meta.url);
  await Promise.all(
    Array.from(
      { length: JOBS },
      (_, shard) =>
        new Promise<void>((resolve, reject) => {
          const p = fork(self, [...process.argv.slice(2), '--child', String(shard), String(JOBS)], {
            execArgv: process.execArgv,
            env: { ...process.env, GATE_TASKS: JSON.stringify(tasks) },
          });
          p.on('message', (m) => report(m as Outcome));
          p.on('error', reject);
          p.on('exit', (code) =>
            code ? reject(new Error(`shard ${shard} exited ${code}`)) : resolve(),
          );
        }),
    ),
  );
}

const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
/** Win rate with a 95% interval over matchups (each matchup's two sides averaged, since they share luck). */
function summary(os: Outcome[]) {
  const byMatch = new Map<string, number[]>();
  for (const o of os) {
    const k = `${o.format}:${o.i}`;
    byMatch.set(k, [...(byMatch.get(k) ?? []), o.score]);
  }
  const pairs = [...byMatch.values()].map((s) => s.reduce((a, b) => a + b, 0) / s.length);
  const mean = pairs.reduce((a, b) => a + b, 0) / pairs.length;
  const sd = Math.sqrt(
    pairs.reduce((a, p) => a + (p - mean) ** 2, 0) / Math.max(1, pairs.length - 1),
  );
  const ci = (1.96 * sd) / Math.sqrt(pairs.length);
  const w = os.filter((o) => o.score === 1).length;
  const l = os.filter((o) => o.score === 0).length;
  const msA =
    os.reduce((a, o) => a + o.msA, 0) /
    Math.max(
      1,
      os.reduce((a, o) => a + o.decA, 0),
    );
  const msB =
    os.reduce((a, o) => a + o.msB, 0) /
    Math.max(
      1,
      os.reduce((a, o) => a + o.decB, 0),
    );
  return {
    mean,
    lo: mean - ci,
    line:
      `win ${pct(mean).padStart(6)} (95% ${pct(mean - ci)}–${pct(mean + ci)})  ` +
      `${w}-${l}-${os.length - w - l}  ${msA.toFixed(0)} vs ${msB.toFixed(0)} ms/decision`,
  };
}
console.log(`done in ${((performance.now() - t0) / 60000).toFixed(1)} min`);
let pass = true;
for (const format of FORMAT_IDS) {
  const s = summary(outcomes.filter((o) => o.format === format));
  if (s.lo <= 0.5) pass = false;
  console.log(`  ${format}  ${s.line}`);
}
const all = summary(outcomes);
if (all.mean < 0.6) pass = false;
console.log(`  pooled  ${all.line}`);
const searched = outcomes.reduce((a, o) => a + o.searchedA, 0);
const varied = outcomes.reduce((a, o) => a + o.variedA, 0);
if (varied)
  console.log(`  challenger drew a near-tie in ${pct(varied / searched)} of searched decisions`);
console.log(pass ? 'PASS' : 'FAIL (need >= 60% pooled, every gen above 50%)');
