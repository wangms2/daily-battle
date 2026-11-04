// Offline coach-quality check (docs/plan-tutorial-coach.md): does following the
// coach's advice win more often against the AI the player actually faces?
//   pnpm --filter @daily-battle/tutorial coach-eval
//     [--vs easy] [--battles 200] [--first 0] [--r 40] [--cases 60] [--per-battle 3] [--jobs 16]
//     [--out file.json] [--hard-iterations 150000] [--save-cases f.json] [--load-cases f.json]
//     [--shown] [--collect-only] [--judge search|net|both]
//
// --judge picks the coach's judge: the search (`Judge`, the default), Master's
// network (`NetJudge`), or both at the same decisions, each judge's top choice
// rolled out against the same pick (to set the network's thresholds).
//
// Against Hard (--vs hard), --hard-iterations sets the opponent's search
// budget (Hard's own by default), and --save-cases / --load-cases roll out the
// same cases at two budgets, to check a cheaper Hard gives the same answers.
//
// 1. Collect: play Gen 3 battles (a weekly-pool team, played by a beginner-ish
//    bot, against a daily opponent on the chosen difficulty) and save decisions
//    where the bot's pick isn't the judge's top choice, with the judged gap and
//    the warning the coach would show (if any), so the report can show how
//    judged gaps and shown warnings turn into real wins.
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
import { aiFor, extractState, midBot, strongBot, type Difficulty } from '@daily-battle/ai';
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
import { MASTER_NET_PATH } from '@daily-battle/ai/version';
import { Judge, JUDGE_DEFAULTS, type CoachJudge } from '../src/coach/judge';
import { NetJudge, NET_JUDGE_DEFAULTS } from '../src/coach/net-judge';
import { Coach, type CoachNote } from '../src/coach/simple';

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const FORMAT = 'gen3ou';
// The coach never plays against Master (it is Master's brain).
const VS = (arg('vs') ?? 'easy') as Exclude<Difficulty, 'master'>;
const BATTLES = Number(arg('battles') ?? 200);
/** The first battle index: a fresh range checks results on battles not used for tuning. */
const FIRST = Number(arg('first') ?? 0);
const R = Number(arg('r') ?? 40);
const MAX_CASES = Number(arg('cases') ?? 60);
/** Cases taken from one battle at most, so no one battle dominates. */
const PER_BATTLE = Number(arg('per-battle') ?? 3);
const JOBS = Number(arg('jobs') ?? 1);
const OUT = arg('out');
/** Only decisions where the coach shows a warning (step 4's check of every message shown). */
const SHOWN = process.argv.includes('--shown');
/** Collect (and --save-cases) only: shards of a big run collect in parallel, then roll out together. */
const COLLECT_ONLY = process.argv.includes('--collect-only');
/** The judge's budget per search. */
const JUDGE_ITERATIONS = Number(arg('judge-iterations') ?? JUDGE_DEFAULTS.iterations);
/** Against Hard: the opponent's search budget (Hard's own when left out). */
const HARD_ITERATIONS = arg('hard-iterations') ? Number(arg('hard-iterations')) : undefined;
type JudgeName = 'search' | 'net';
const JUDGE_ARG = arg('judge') ?? 'search';
const JUDGES: JudgeName[] = JUDGE_ARG === 'both' ? ['search', 'net'] : [JUDGE_ARG as JudgeName];
const NET_FILE = join(
  fileURLToPath(import.meta.url),
  '../../../../apps/web/public',
  MASTER_NET_PATH,
);
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
let netEngine3: ReturnType<typeof loadEngine> | undefined;
const netEngine = () => {
  if (!netEngine3) {
    netEngine3 = loadEngine(3);
    netEngine3.netLoad(new Uint8Array(readFileSync(NET_FILE)));
  }
  return netEngine3;
};

const judgeFor = (name: JudgeName, pool: string[]): CoachJudge =>
  name === 'net'
    ? new NetJudge(netEngine(), data, { pool })
    : new Judge(engine(), data, { pool, iterations: JUDGE_ITERATIONS });

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

/** A judge's opinion of the pick: its top choice, the gap, and the warning the coach would show. */
interface Opinion {
  top: string;
  gap: number;
  /** The share of worlds agreeing. */
  agree: number;
  text?: string;
  rule?: CoachNote['rule'];
}

interface Case {
  battle: number;
  turn: number;
  /** Both sides' choices before the decision. */
  p1: string[];
  p2: string[];
  /** The bot's pick, which the coach would warn about. */
  warned: string;
  /** Each judge's opinion (at least one has a top other than the pick). */
  judges: Partial<Record<JudgeName, Opinion>>;
  position: string;
}

/** The win rate with a choice in place of the pick: `a`, its gain over the pick, and its standard error. */
interface Alt {
  a: number;
  diff: number;
  se: number;
}

interface Result extends Case {
  /** The pick's win rate. */
  b: number;
  alts: Record<string, Alt>;
}

function describe(view: SideView): string {
  const st = extractState(view, data);
  return (
    `${st.ownActive?.species} ${Math.round(100 * (st.ownActive?.hpFrac ?? 0))}% vs ` +
    `${st.foeActive?.species} ${Math.round(100 * (st.foeActive?.hpFrac ?? 0))}%` +
    (st.ownSide.spikes ? `, your Spikes ${st.ownSide.spikes}` : '')
  );
}

/** Decisions judged (how often the coach would warn, per decision). */
let judgedDecisions = 0;

function collect(vs: Difficulty): Case[] {
  const cases: Case[] = [];
  for (let i = FIRST; i < FIRST + BATTLES && cases.length < MAX_CASES; i++) {
    const m = matchup(i);
    const session = new BattleSession({ format: FORMAT, ...m });
    // Each judge with its own coach, which remembers the warnings it showed.
    const judges = JUDGES.map(
      (name) => [name, judgeFor(name, m.pool), new Coach(data, FORMAT, VS)] as const,
    );
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
        for (const [, , coach] of judges) coach.turn(view);
        const choice = player.choose(view, rngs.p1);
        const room =
          cases.length < MAX_CASES && cases.filter((c) => c.battle === i).length < PER_BATTLE;
        const notes = new Map<JudgeName, CoachNote>();
        if (
          room &&
          view.request.requestType === 'move' &&
          legalChoices(view.request).length > 1 &&
          // Spread the cases over the battle (every decision when only shown warnings count).
          (SHOWN || pick() < 0.4)
        ) {
          judgedDecisions++;
          const opinions: Case['judges'] = {};
          for (const [name, judge, coach] of judges) {
            judge.begin(view, `eval:${i}:${session.turn}`);
            const v = judge.settle(choice, Infinity);
            if (!v || v.top === choice) continue;
            const n = coach.warn(view, v);
            if (n) notes.set(name, n);
            if (n || !SHOWN)
              opinions[name] = {
                top: v.top,
                gap: v.gap,
                agree: v.agree,
                ...(n ? { text: n.text, rule: n.rule } : {}),
              };
          }
          if (Object.keys(opinions).length)
            cases.push({
              battle: i,
              turn: session.turn,
              p1: [...session.choices('p1')],
              p2: [...session.choices('p2')],
              warned: choice,
              judges: opinions,
              position: describe(view),
            });
        }
        for (const [name, , coach] of judges) coach.record(view, choice, notes.get(name) ?? null);
        if (!session.choose('p1', choice)) for (const [, , coach] of judges) coach.forget();
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
  const tops = [...new Set(Object.values(c.judges).map((o) => o.top))];
  const b: number[] = [];
  const a = tops.map(() => [] as number[]);
  for (let k = 0; k < R; k++) {
    b.push(rollout(c, n, c.warned, k, vs));
    tops.forEach((t, j) => a[j]!.push(rollout(c, n, t, k, vs)));
  }
  const alts: Record<string, Alt> = {};
  tops.forEach((t, j) => {
    const diffs = a[j]!.map((x, k) => x - b[k]!);
    alts[t] = { a: mean(a[j]!), diff: mean(diffs), se: sdOf(diffs) / Math.sqrt(R) };
  });
  return { ...c, b: mean(b), alts };
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

/** One judge's view of a case: its opinion and how its top choice really did against the pick. */
interface Row extends Opinion, Alt {
  r: Result;
}
const rowsOf = (name: JudgeName, rs: Result[]): Row[] =>
  rs.flatMap((r) => {
    const o = r.judges[name];
    return o ? [{ ...o, ...r.alts[o.top]!, r }] : [];
  });

function summary(label: string, rs: Row[], decisions = 0): string {
  if (!rs.length) return `  ${label}: no cases`;
  const d = mean(rs.map((r) => r.diff));
  const ci = (1.96 * sdOf(rs.map((r) => r.diff))) / Math.sqrt(rs.length);
  const worse = rs.filter((r) => r.diff < -2 * r.se).length;
  const rate = decisions ? `  ${pct(rs.length / decisions)} of decisions` : '';
  return (
    `  ${label.padEnd(26)} ${String(rs.length).padStart(4)} cases  gain ${pts(d)} pts ` +
    `(CI ${pts(d - ci)} to ${pts(d + ci)})  A ${pct(mean(rs.map((r) => r.a)))} vs B ${pct(mean(rs.map((r) => r.r.b)))}` +
    `  clearly worse ${worse} (${pct(worse / rs.length)})${rate}`
  );
}

const t0 = performance.now();
const LOAD = arg('load-cases');
const cases = LOAD ? (JSON.parse(readFileSync(LOAD, 'utf8')) as Case[]) : collect(VS);
const SAVE = arg('save-cases');
if (SAVE) writeFileSync(SAVE, JSON.stringify(cases));
if (COLLECT_ONLY) {
  console.log(`${cases.length} cases collected (${judgedDecisions} decisions judged)`);
  process.exit(0);
}
console.log(
  `${cases.length} judged cases (${judgedDecisions} decisions judged) from up to ${BATTLES} battles vs ${VS}` +
    ` (${((performance.now() - t0) / 1000).toFixed(1)}s)`,
);
const results = await rollAll(cases, VS);
const secs = ((performance.now() - t0) / 1000).toFixed(0);
console.log(
  `\nJudges ${JUDGES.join(', ')} vs ${VS}: ${results.length} cases x ${R} rollouts per branch (${secs}s, ${JOBS} jobs)`,
);
const defaults = { search: JUDGE_DEFAULTS, net: NET_JUDGE_DEFAULTS };
for (const name of JUDGES) {
  const rows = rowsOf(name, results);
  const { margin, agree } = defaults[name];
  console.log(`\n== ${name} judge (now: margin ${margin}, agree ${agree})`);
  // How judged gaps turn into real wins.
  const edges = [0, 0.03, 0.05, 0.1, 0.15, 0.25, 0.4, Infinity];
  console.log('By judged gap (all worlds):');
  for (let e = 0; e + 1 < edges.length; e++)
    console.log(
      summary(
        `gap ${edges[e]}-${edges[e + 1]}`,
        rows.filter((r) => r.gap >= edges[e]! && r.gap < edges[e + 1]!),
      ),
    );
  console.log('Warned (gap >= margin, agree >= a), share of judged decisions:');
  for (const a of [0.5, 0.75, 0.9])
    for (const m of [0.03, 0.05, 0.1, 0.15, 0.2, 0.3])
      console.log(
        summary(
          `margin ${m} agree ${a}`,
          rows.filter((r) => r.gap >= m && r.agree >= a),
          judgedDecisions,
        ),
      );
  console.log('Warnings the coach shows, by reason:');
  const shown = rows.filter((r) => r.rule);
  console.log(summary('all shown', shown, judgedDecisions));
  for (const rule of [...new Set(shown.map((r) => r.rule))])
    console.log(
      summary(
        `  ${rule}`,
        shown.filter((r) => r.rule === rule),
      ),
    );
  console.log('Worst cases:');
  for (const r of [...rows].sort((x, y) => x.diff - y.diff).slice(0, 6))
    console.log(
      `  battle ${r.r.battle} turn ${r.r.turn}: ${r.r.position}` +
        `  (judged gap ${r.gap.toFixed(2)}, agree ${r.agree.toFixed(2)})` +
        (r.text ? `\n    "${r.text}"` : '') +
        `\n    ${r.top} ${pct(r.a)} vs ${r.r.warned} ${pct(r.r.b)} (gain ${(100 * r.diff).toFixed(0)} ± ${(196 * r.se).toFixed(0)})`,
    );
}
if (JUDGES.length > 1) {
  // The judges' value scales, at decisions where both would pick something else.
  const both = results.filter((r) => r.judges.search && r.judges.net);
  const ratios = both
    .filter((r) => r.judges.search!.gap > 0.01)
    .map((r) => r.judges.net!.gap / r.judges.search!.gap)
    .sort((x, y) => x - y);
  const same = both.filter((r) => r.judges.search!.top === r.judges.net!.top).length;
  console.log(
    `\nBoth judges against the pick: ${both.length} cases, same top in ${same};` +
      ` net/search gap ratio median ${ratios[Math.floor(ratios.length / 2)]?.toFixed(2)}` +
      ` (quartiles ${ratios[Math.floor(ratios.length / 4)]?.toFixed(2)}-${ratios[Math.floor((3 * ratios.length) / 4)]?.toFixed(2)})`,
  );
}
if (OUT) writeFileSync(OUT, JSON.stringify({ vs: VS, R, judgedDecisions, results }, null, 1));
