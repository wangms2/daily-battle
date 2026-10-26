// Offline coach-quality check (docs/plan-tutorial-coach.md): does following the
// coach's advice win more often against the AI the player actually faces?
//   pnpm --filter @daily-battle/tutorial coach-eval [--mode judge|rule] [--rule switchKo]
//     [--vs easy] [--battles 200] [--r 40] [--cases 60] [--per-battle 3] [--jobs 16]
//     [--out file.json] [--hard-iterations 150000] [--save-cases f.json] [--load-cases f.json]
//
// Against Hard (--vs hard), --hard-iterations sets the opponent's search
// budget (Hard's own by default), and --save-cases / --load-cases roll out the
// same cases at two budgets, to check a cheaper Hard gives the same answers.
//
// 1. Collect: play Gen 3 battles (a weekly-pool team, played by a beginner-ish
//    bot, against a daily opponent on the chosen difficulty) and save decisions
//    as cases: the bot's pick, and the alternative the coach would point to.
//    - rule mode: decisions where one rule warns (the alternative is the best
//      other choice by the review's scores);
//    - judge mode: decisions where the bot's pick isn't the judge's top choice,
//      with the judged gap, so the report can show how judged gaps turn into
//      real wins (which margin makes a warning trustworthy).
// 2. Roll out: replay each case to its decision, then play it to the end R
//    times with the alternative (A) and with the pick (B). Each rollout gets
//    fresh luck (a new battle seed and AI seeds), shared by A and B. The
//    player's side continues with the strong bot; the foe is the real opponent
//    AI, which sees only what it would in the app.
// 3. Report: the mean gain from A over B, with a 95% CI, and the share of cases
//    where A is clearly worse (by more than 2 standard errors).
import { fork } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  aiFor,
  extractState,
  midBot,
  scoreActions,
  STRONG,
  strongBot,
  type Difficulty,
} from '@daily-battle/ai';
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
  type Policy,
  type SideID,
  type SideView,
} from '@daily-battle/sim-bridge';
import type { PRNGSeed } from '@pkmn/sim';
import { Judge, JUDGE_DEFAULTS } from '../src/coach/judge';
import { Coach, type CoachRule } from '../src/coach/simple';

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const FORMAT = 'gen3ou';
const MODE = (arg('mode') ?? 'judge') as 'judge' | 'rule';
const RULE = (arg('rule') ?? 'switchKo') as CoachRule;
const VS = (arg('vs') ?? 'easy') as Difficulty;
const BATTLES = Number(arg('battles') ?? 200);
const R = Number(arg('r') ?? 40);
const MAX_CASES = Number(arg('cases') ?? 60);
/** Cases taken from one battle at most, so no one battle dominates. */
const PER_BATTLE = Number(arg('per-battle') ?? 3);
const JOBS = Number(arg('jobs') ?? 1);
const OUT = arg('out');
/** Judge mode: the judge's budget per search. */
const JUDGE_ITERATIONS = Number(arg('judge-iterations') ?? JUDGE_DEFAULTS.iterations);
/** Against Hard: the opponent's search budget (Hard's own when left out). */
const HARD_ITERATIONS = arg('hard-iterations') ? Number(arg('hard-iterations')) : undefined;
const START = '2026-01-05';
const data = setsFor(FORMAT);
type PokemonSet = ReturnType<typeof toPokemonSet>;

/** A pool team: 6 of the week's 12, sets drawn by weight (as packages/ai/scripts/eval.ts). */
function poolTeam(i: number, week: string): PokemonSet[] {
  const rng = rngFor(`coach-eval:pool-team:${i}`);
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

function matchup(i: number) {
  const week = addDays(START, 7 * Math.floor(i / 7));
  const day = addDays(week, i % 7);
  const opp = generateOpponent(day, data);
  return {
    seed: deriveSeed('coach-eval:battle', i),
    p1: { team: poolTeam(i, week) },
    p2: { team: teamSets(data, opp.team) },
    style: opp.style,
    pool: generatePool(week, data).species,
  };
}
type Matchup = ReturnType<typeof matchup>;

let engine3: ReturnType<typeof loadEngine> | undefined;
const engine = () => (engine3 ??= loadEngine(3));

/** The opponent as the app plays it (Hard with the week's pool, as in the daily). */
const foe = (m: Matchup, vs: Difficulty): Policy =>
  aiFor({
    difficulty: vs,
    style: m.style,
    data,
    ...(vs === 'hard' && {
      engine: engine(),
      pool: m.pool,
      ...(HARD_ITERATIONS ? { hard: { iterations: HARD_ITERATIONS } } : {}),
    }),
  });

interface Case {
  battle: number;
  turn: number;
  /** Both sides' choices before the decision. */
  p1: string[];
  p2: string[];
  /** The bot's pick, which the coach would warn about. */
  warned: string;
  /** The coach's alternative. */
  alt: string;
  /** A rule's warning on the pick, if one fired. */
  text?: string;
  rule?: CoachRule;
  /** Judge mode: the judged gap and the share of worlds agreeing. */
  gap?: number;
  agree?: number;
  position: string;
}

interface Result extends Case {
  a: number;
  b: number;
  diff: number;
  se: number;
}

function describe(view: SideView): string {
  const st = extractState(view, data);
  return (
    `${st.ownActive?.species} ${Math.round(100 * (st.ownActive?.hpFrac ?? 0))}% vs ` +
    `${st.foeActive?.species} ${Math.round(100 * (st.foeActive?.hpFrac ?? 0))}%` +
    (st.ownSide.spikes ? `, your Spikes ${st.ownSide.spikes}` : '')
  );
}

function collect(vs: Difficulty): Case[] {
  const cases: Case[] = [];
  for (let i = 0; i < BATTLES && cases.length < MAX_CASES; i++) {
    const m = matchup(i);
    const session = new BattleSession({ format: FORMAT, ...m });
    const coach = new Coach(data, FORMAT);
    const judge =
      MODE === 'judge'
        ? new Judge(engine(), data, { pool: m.pool, iterations: JUDGE_ITERATIONS })
        : undefined;
    // Beginner-ish players: Easy and the mid bot, alternating.
    const player = i % 2 ? midBot({ data }) : aiFor({ difficulty: 'easy', style: 'balance', data });
    const opponent = foe(m, vs);
    const rngs: Record<SideID, () => number> = {
      p1: makeRng(deriveSeed('coach-eval:p1', i)),
      p2: makeRng(deriveSeed('coach-eval:p2', i)),
    };
    const pick = makeRng(deriveSeed('coach-eval:pick', i));
    while (!session.ended) {
      for (const side of ['p1', 'p2'] as const) {
        const view = session.view(side);
        if (!view || session.ended) continue;
        if (side === 'p2') {
          session.choose('p2', opponent.choose(view, rngs.p2));
          continue;
        }
        const t = coach.turn(view);
        const choice = player.choose(view, rngs.p1);
        const room =
          cases.length < MAX_CASES && cases.filter((c) => c.battle === i).length < PER_BATTLE;
        const base = {
          battle: i,
          turn: session.turn,
          p1: [...session.choices('p1')],
          p2: [...session.choices('p2')],
        };
        if (MODE === 'rule' && room) {
          const warned = Object.entries(t.warnings).filter(([, n]) => n.rule === RULE);
          if (warned.length) {
            // One case per decision.
            const [w, note] = warned[Math.floor(pick() * warned.length)]!;
            const scored = scoreActions(view, extractState(view, data), STRONG, () => 0.5, data)
              .filter((s) => !t.warnings[s.choice])
              .sort((a, b) => b.score - a.score);
            if (scored[0])
              cases.push({
                ...base,
                warned: w,
                alt: scored[0].choice,
                text: note.text,
                rule: note.rule,
                position: describe(view),
              });
          }
        } else if (
          judge &&
          room &&
          view.request.requestType === 'move' &&
          legalChoices(view.request).length > 1 &&
          // Spread the cases over the battle.
          pick() < 0.4
        ) {
          judge.begin(view, `eval:${i}:${session.turn}`);
          const v = judge.settle(choice, Infinity);
          if (v && v.top !== choice) {
            const note = t.warnings[choice];
            cases.push({
              ...base,
              warned: choice,
              alt: v.top,
              gap: v.gap,
              agree: v.agree,
              ...(note ? { text: note.text, rule: note.rule } : {}),
              position: describe(view),
            });
          }
        }
        coach.record(view, choice);
        if (!session.choose('p1', choice)) coach.forget();
      }
    }
  }
  return cases;
}

/** Plays a case to the end with `first` as the player's choice; 1 a win, 0.5 a tie, 0 a loss. */
function rollout(c: Case, n: number, first: string, k: number, vs: Difficulty): number {
  const m = matchup(c.battle);
  const session = new BattleSession({ format: FORMAT, ...m });
  const next = { p1: 0, p2: 0 };
  // Replay to the decision (p1 chooses first each round, as when it was collected).
  for (;;) {
    const p1 = session.view('p1');
    if (p1 && next.p1 >= c.p1.length) break;
    let acted = false;
    for (const side of ['p1', 'p2'] as const) {
      if (!session.view(side)) continue;
      const list = c[side];
      if (next[side] >= list.length) break;
      session.choose(side, list[next[side]++]!);
      acted = true;
    }
    if (!acted) throw new Error(`replay stalled in battle ${c.battle} turn ${c.turn}`);
  }
  if (session.turn !== c.turn)
    throw new Error(`replay of battle ${c.battle} reached turn ${session.turn}, not ${c.turn}`);
  const key = `coach-eval:case${n}:${k}`;
  session.reseed(deriveSeed(`${key}:battle`, 0) as PRNGSeed);
  const player = strongBot({ data });
  const opponent = foe(m, vs);
  const rngs = {
    p1: makeRng(deriveSeed(`${key}:p1`, 0)),
    p2: makeRng(deriveSeed(`${key}:p2`, 0)),
  };
  session.choose('p1', first);
  while (!session.ended) {
    for (const side of ['p1', 'p2'] as const) {
      const view = session.view(side);
      if (!view || session.ended) continue;
      const policy = side === 'p1' ? player : opponent;
      session.choose(side, policy.choose(view, rngs[side]));
    }
  }
  return session.winner === 'p1' ? 1 : session.winner === 'p2' ? 0 : 0.5;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const sdOf = (xs: number[]) => {
  const d = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - d) ** 2, 0) / Math.max(1, xs.length - 1));
};

function rollCase(c: Case, n: number, vs: Difficulty): Result {
  const a: number[] = [];
  const b: number[] = [];
  for (let k = 0; k < R; k++) {
    a.push(rollout(c, n, c.alt, k, vs));
    b.push(rollout(c, n, c.warned, k, vs));
  }
  const diffs = a.map((x, k) => x - b[k]!);
  return { ...c, a: mean(a), b: mean(b), diff: mean(diffs), se: sdOf(diffs) / Math.sqrt(R) };
}

// A child process rolls out its share of the cases: --child <cases file> <shard> <jobs> <vs>.
const child = process.argv.indexOf('--child');
if (child > 0) {
  const [file, shard, jobs, vs] = process.argv.slice(child + 1);
  const cases = JSON.parse(readFileSync(file!, 'utf8')) as Case[];
  const out: Result[] = [];
  cases.forEach((c, n) => {
    if (n % Number(jobs) === Number(shard)) out.push(rollCase(c, n, vs as Difficulty));
  });
  process.send!(out);
  process.exit(0);
}

async function rollAll(cases: Case[], vs: Difficulty): Promise<Result[]> {
  if (JOBS <= 1) return cases.map((c, n) => rollCase(c, n, vs));
  const file = join(tmpdir(), `coach-eval-${process.pid}.json`);
  writeFileSync(file, JSON.stringify(cases));
  const self = fileURLToPath(import.meta.url);
  const parts = await Promise.all(
    Array.from(
      { length: JOBS },
      (_, shard) =>
        new Promise<Result[]>((resolve, reject) => {
          const p = fork(
            self,
            [
              '--child',
              file,
              String(shard),
              String(JOBS),
              vs,
              '--r',
              String(R),
              ...(HARD_ITERATIONS ? ['--hard-iterations', String(HARD_ITERATIONS)] : []),
            ],
            {
              execArgv: process.execArgv,
            },
          );
          p.on('message', (m) => resolve(m as Result[]));
          p.on('error', reject);
          p.on('exit', (code) => code && reject(new Error(`shard ${shard} exited ${code}`)));
        }),
    ),
  );
  return parts.flat();
}

const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
const pts = (x: number) => `${x >= 0 ? '+' : ''}${(100 * x).toFixed(1)}`;

function summary(label: string, rs: Result[]): string {
  if (!rs.length) return `  ${label}: no cases`;
  const d = mean(rs.map((r) => r.diff));
  const ci = (1.96 * sdOf(rs.map((r) => r.diff))) / Math.sqrt(rs.length);
  const worse = rs.filter((r) => r.diff < -2 * r.se).length;
  return (
    `  ${label.padEnd(26)} ${String(rs.length).padStart(4)} cases  gain ${pts(d)} pts ` +
    `(CI ${pts(d - ci)} to ${pts(d + ci)})  A ${pct(mean(rs.map((r) => r.a)))} vs B ${pct(mean(rs.map((r) => r.b)))}` +
    `  clearly worse ${worse} (${pct(worse / rs.length)})`
  );
}

const t0 = performance.now();
const LOAD = arg('load-cases');
const cases = LOAD ? (JSON.parse(readFileSync(LOAD, 'utf8')) as Case[]) : collect(VS);
const SAVE = arg('save-cases');
if (SAVE) writeFileSync(SAVE, JSON.stringify(cases));
console.log(
  `${cases.length} ${MODE === 'rule' ? RULE : 'judged'} cases from up to ${BATTLES} battles vs ${VS}` +
    ` (${((performance.now() - t0) / 1000).toFixed(1)}s)`,
);
const results = await rollAll(cases, VS);
const secs = ((performance.now() - t0) / 1000).toFixed(0);
console.log(
  `\n${MODE === 'rule' ? RULE : 'Judge'} vs ${VS}: ${results.length} cases x ${R} rollouts per branch (${secs}s, ${JOBS} jobs)`,
);
if (MODE === 'rule') {
  console.log(summary(RULE, results));
} else {
  // How judged gaps turn into real wins.
  const bins: [string, (r: Result) => boolean][] = [
    ['gap < 0.05', (r) => r.gap! < 0.05],
    ['gap 0.05-0.10', (r) => r.gap! >= 0.05 && r.gap! < 0.1],
    ['gap 0.10-0.15', (r) => r.gap! >= 0.1 && r.gap! < 0.15],
    ['gap 0.15-0.25', (r) => r.gap! >= 0.15 && r.gap! < 0.25],
    ['gap >= 0.25', (r) => r.gap! >= 0.25],
  ];
  console.log('By judged gap (all worlds):');
  for (const [label, f] of bins) console.log(summary(label, results.filter(f)));
  console.log('Robust (ahead in >= 90% of worlds), by margin:');
  for (const m of [0.05, 0.1, 0.15, 0.2])
    console.log(
      summary(
        `gap >= ${m}`,
        results.filter((r) => r.gap! >= m && r.agree! >= 0.9),
      ),
    );
  console.log('Not robust (ahead in < 90% of worlds), gap >= 0.10:');
  console.log(
    summary(
      'gap >= 0.1',
      results.filter((r) => r.gap! >= 0.1 && r.agree! < 0.9),
    ),
  );
  console.log('Where a rule also warned:');
  console.log(
    summary(
      'rule warned',
      results.filter((r) => r.rule),
    ),
  );
}
console.log('\nWorst cases:');
for (const r of [...results].sort((x, y) => x.diff - y.diff).slice(0, 6))
  console.log(
    `  battle ${r.battle} turn ${r.turn}: ${r.position}` +
      (r.gap !== undefined
        ? `  (judged gap ${r.gap.toFixed(2)}, agree ${r.agree!.toFixed(2)})`
        : '') +
      (r.text ? `\n    "${r.text}"` : '') +
      `\n    ${r.alt} ${pct(r.a)} vs ${r.warned} ${pct(r.b)} (gain ${(100 * r.diff).toFixed(0)} ± ${(196 * r.se).toFixed(0)})`,
  );
if (OUT)
  writeFileSync(OUT, JSON.stringify({ mode: MODE, rule: RULE, vs: VS, R, results }, null, 1));
