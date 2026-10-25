// Plays the AI against comparison bots on generated content (DESIGN.md §13 M4).
//   pnpm --filter @daily-battle/ai eval [--n 200] [--assert] [--debug] [--styles] [--format gen4ou]
//     [--hard] [--hard-n 30] [--hard-iterations 40000] [--hard-worlds 8] [--only-hard]
// Each matchup pairs a team drawn from a weekly pool with that week's daily
// opponent, and is played twice with the policies swapped between the teams.
import { setsFor } from '@daily-battle/data';
import {
  addDays,
  generateOpponent,
  generatePool,
  rngFor,
  teamSets,
  toPokemonSet,
} from '@daily-battle/gen';
import { engineBuilt, loadEngine } from '@daily-battle/engine-wasm/node';
import { deriveSeed, RandomPolicy, runBattle, type Policy } from '@daily-battle/sim-bridge';
type PokemonSet = ReturnType<typeof toPokemonSet>;
import {
  aiFor,
  aiForStyle,
  HardPolicy,
  midBot,
  NaivePolicy,
  strongBot,
  UtilityPolicy,
  type PolicyStats,
} from '../src/index';

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const N = Number(arg('n') ?? 200);
const ASSERT = process.argv.includes('--assert');
const DEBUG = process.argv.includes('--debug');
/** Also report the opponent AI's behavior per style preset (slower; M9). */
const STYLES = process.argv.includes('--styles');
const START = '2026-01-05';
/** The format to play, Gen 4 OU unless `--format` says otherwise. */
const FORMAT = arg('format') ?? 'gen4ou';
const sets = setsFor(FORMAT);
/** Hard pairings (needs pnpm --filter @daily-battle/engine-wasm build:wasm); slower, so fewer matchups. */
const HARD = process.argv.includes('--hard');
/** Skip the non-Hard pairings (for tuning Hard). */
const ONLY_HARD = HARD && process.argv.includes('--only-hard');
const HARD_N = Math.min(N, Number(arg('hard-n') ?? 30));
const GEN = Number(FORMAT.slice(3, 4));
if (HARD && !engineBuilt(GEN)) throw new Error(`no engine for ${FORMAT}: run build:wasm first`);
const engine = HARD ? loadEngine(GEN) : undefined;
const hardBudget = {
  ...(arg('hard-iterations') ? { iterations: Number(arg('hard-iterations')) } : {}),
  ...(arg('hard-worlds') ? { worlds: Number(arg('hard-worlds')) } : {}),
};

/** A pool team: 6 of the week's 12, sets drawn by weight. */
function poolTeam(i: number, week: string): PokemonSet[] {
  const rng = rngFor(`eval:pool-team:${i}`);
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

const matchups = Array.from({ length: N }, (_, i) => {
  const week = addDays(START, 7 * Math.floor(i / 7));
  const day = addDays(week, i % 7);
  return {
    i,
    pool: generatePool(week, sets).species,
    a: poolTeam(i, week),
    b: teamSets(sets, generateOpponent(day, sets).team),
  };
});

interface Totals {
  wins: number;
  losses: number;
  ties: number;
  turns: number;
  battles: number;
  stats: PolicyStats[];
  ms: number;
  decisions: number;
  /** Hard only: decisions made by search, and engine errors. */
  searched: number;
  errors: string[];
}

type Make = (pool: readonly string[]) => Policy;

function play(label: string, makeA: Make, makeB: Make, n = N): Totals {
  const t: Totals = {
    wins: 0,
    losses: 0,
    ties: 0,
    turns: 0,
    battles: 0,
    stats: [],
    ms: 0,
    decisions: 0,
    searched: 0,
    errors: [],
  };
  for (const { i, pool, a, b } of matchups.slice(0, n)) {
    for (const swap of [false, true]) {
      const pa = makeA(pool);
      const pb = makeB(pool);
      const timed: Policy = {
        choose(view, rng) {
          const t0 = performance.now();
          const c = pa.choose(view, rng);
          t.ms += performance.now() - t0;
          t.decisions++;
          return c;
        },
      };
      const result = runBattle({
        format: FORMAT,
        seed: deriveSeed(`eval:${label}:battle`, 2 * i + Number(swap)),
        p1: { team: swap ? b : a, policy: timed, seed: deriveSeed(`eval:${label}:p1`, i) },
        p2: { team: swap ? a : b, policy: pb, seed: deriveSeed(`eval:${label}:p2`, i) },
      });
      if (DEBUG && i === 0 && !swap) console.log(result.spectatorLog.join('\n'));
      t.battles++;
      t.turns += result.turns;
      if (result.winner === 'p1') t.wins++;
      else if (result.winner === 'p2') t.losses++;
      else t.ties++;
      if (pa instanceof UtilityPolicy) t.stats.push(pa.stats);
      if (pa instanceof HardPolicy) {
        t.searched += pa.stats.searched;
        t.errors.push(...pa.stats.errors);
      }
    }
  }
  return t;
}

const rate = (t: Totals) => (t.wins + t.ties / 2) / t.battles;
const pct = (x: number) => `${(100 * x).toFixed(1)}%`;

const t0 = performance.now();
const rows: [string, Totals, number | null][] = ONLY_HARD
  ? []
  : [
      [
        'mid vs random',
        play(
          'mid-random',
          () => midBot({ data: sets }),
          () => new RandomPolicy(),
        ),
        0.9,
      ],
      [
        'mid vs naive',
        play(
          'mid-naive',
          () => midBot({ data: sets }),
          () => new NaivePolicy(sets),
        ),
        0.6,
      ],
      [
        'strong vs mid',
        play(
          'strong-mid',
          () => strongBot({ data: sets }),
          () => midBot({ data: sets }),
        ),
        0.5,
      ],
      [
        'naive vs random',
        play(
          'naive-random',
          () => new NaivePolicy(sets),
          () => new RandomPolicy(),
        ),
        null,
      ],
      // Easy should feel like a beginner: clearly weaker than Normal, still far better than random.
      [
        'mid vs easy',
        play(
          'mid-easy',
          () => midBot({ data: sets }),
          () => aiFor({ difficulty: 'easy', style: 'balance', data: sets }),
        ),
        0.7,
      ],
      [
        'easy vs random',
        play(
          'easy-random',
          () => aiFor({ difficulty: 'easy', style: 'balance', data: sets }),
          () => new RandomPolicy(),
        ),
        0.85,
      ],
      [
        'naive vs easy',
        play(
          'naive-easy',
          () => new NaivePolicy(sets),
          () => aiFor({ difficulty: 'easy', style: 'balance', data: sets }),
        ),
        null,
      ],
    ];
const hard = (pool: readonly string[]) =>
  aiFor({
    difficulty: 'hard',
    style: 'balance',
    data: sets,
    engine: engine!,
    pool,
    hard: hardBudget,
  });
if (HARD) {
  rows.push(
    ['hard vs mid', play('hard-mid', hard, () => midBot({ data: sets }), HARD_N), 0.7],
    ['hard vs strong', play('hard-strong', hard, () => strongBot({ data: sets }), HARD_N), 0.6],
  );
}

console.log(
  `${N} matchups x 2 sides per pairing (${((performance.now() - t0) / 1000).toFixed(1)}s)`,
);
let failed = false;
for (const [label, t, min] of rows) {
  const ok = min === null || rate(t) >= min;
  if (!ok) failed = true;
  console.log(
    `  ${label.padEnd(16)} win ${pct(rate(t)).padStart(6)}  (${t.wins}-${t.losses}-${t.ties})` +
      `  avg turns ${(t.turns / t.battles).toFixed(1)}` +
      (min === null ? '' : `  [need >= ${pct(min)}${ok ? '' : ' FAILED'}]`) +
      (label.startsWith('hard')
        ? `  ${(t.ms / t.decisions).toFixed(0)} ms/decision, searched ${t.searched}/${t.decisions}`
        : ''),
  );
  for (const e of new Set(t.errors)) console.log(`    error: ${e}`);
}

const mid = rows.find(([label]) => label === 'mid vs naive')?.[1];
if (mid) {
  const sum = (f: (s: PolicyStats) => number) => mid.stats.reduce((a, s) => a + f(s), 0);
  const hazardTurns = mid.stats
    .map((s) => s.firstHazardTurn)
    .filter((x): x is number => x !== null);
  console.log('Mid AI behavior (vs naive):');
  console.log(`  switch rate ${pct(sum((s) => s.switches) / sum((s) => s.moveDecisions))}`);
  console.log(
    `  max-damage move rate ${pct(sum((s) => s.maxDamage) / sum((s) => s.moveDecisions))}`,
  );
  console.log(
    `  hazard set in ${pct(hazardTurns.length / mid.stats.length)} of battles, ` +
      `first on turn ${(hazardTurns.reduce((a, b) => a + b, 0) / Math.max(1, hazardTurns.length)).toFixed(1)} on average`,
  );
  console.log(`  ${(mid.ms / mid.decisions).toFixed(1)} ms per decision`);
}

// The opponent AI's style presets against hand-set mid-ladder targets (DESIGN.md §8.5).
// Reported, not asserted: they're estimates to tune toward, not hard limits.
// Stall teams spend more turns on status and recovery, so they click max damage less.
const MAX_DAMAGE = { offense: [0.6, 0.8], balance: [0.55, 0.75], stall: [0.45, 0.65] } as const;
const SWITCHES = [0.08, 0.3] as const;
const within = (x: number, [lo, hi]: readonly [number, number]) =>
  x >= lo && x <= hi ? 'ok' : 'off';
if (STYLES) console.log('Opponent AI by style (vs mid):');
for (const style of STYLES ? (['offense', 'balance', 'stall'] as const) : []) {
  const t = play(
    `style-${style}`,
    () => aiForStyle(style, { data: sets }),
    () => midBot({ data: sets }),
  );
  const total = (f: (s: PolicyStats) => number) => t.stats.reduce((a, s) => a + f(s), 0);
  const moves = total((s) => s.moveDecisions);
  const switches = total((s) => s.switches);
  const maxDamage = total((s) => s.maxDamage) / Math.max(1, moves);
  const switchShare = switches / Math.max(1, moves + switches);
  const hazards = t.stats.map((s) => s.firstHazardTurn).filter((x): x is number => x !== null);
  const firstHazard = hazards.reduce((a, b) => a + b, 0) / Math.max(1, hazards.length);
  // Hazard timing is reported only: it mostly reflects when the setter comes in.
  console.log(
    `  ${style.padEnd(8)} win ${pct(rate(t)).padStart(6)}` +
      `  max-damage ${pct(maxDamage)} [${within(maxDamage, MAX_DAMAGE[style])}]` +
      `  switches ${pct(switchShare)} [${within(switchShare, SWITCHES)}]` +
      `  hazards in ${pct(hazards.length / t.stats.length)} of battles, first on turn ${firstHazard.toFixed(1)}`,
  );
}

if (ASSERT && failed) process.exit(1);
