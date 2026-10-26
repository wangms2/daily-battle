// Offline coach-quality check (docs/plan-tutorial-coach.md, step 2): does
// following the coach's advice win more often against the AI the player
// actually faces? Proof of concept for one rule against one difficulty.
//   pnpm --filter @daily-battle/tutorial coach-eval [--rule switchKo] [--vs easy]
//     [--battles 40] [--r 40] [--cases 60] [--out file.json]
//
// 1. Collect: play Gen 3 battles (a weekly-pool team, played by a beginner-ish
//    bot, against a daily opponent on the chosen difficulty). At each decision
//    where the rule warns about a choice, save the position as a case: the
//    warned choice, and the best other choice by the review's scores.
// 2. Roll out: replay each case to its decision, then play it to the end R
//    times with the warned choice (B) and with the alternative (A). Each
//    rollout gets fresh luck (a new battle seed and AI seeds), shared by A and
//    B. The player's side continues with the strong bot; the foe is the real
//    opponent AI, which sees only what it would in the app.
// 3. Score: a case passes when A's win rate is at least B's minus 2 points.
import { writeFileSync } from 'node:fs';
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
  makeRng,
  type Policy,
  type SideID,
} from '@daily-battle/sim-bridge';
import type { PRNGSeed } from '@pkmn/sim';
import { Coach, type CoachRule } from '../src/coach/simple';

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const FORMAT = 'gen3ou';
const RULE = (arg('rule') ?? 'switchKo') as CoachRule;
const VS = (arg('vs') ?? 'easy') as Difficulty;
const BATTLES = Number(arg('battles') ?? 40);
const R = Number(arg('r') ?? 40);
const MAX_CASES = Number(arg('cases') ?? 60);
const OUT = arg('out');
/** Cases taken from one battle at most. */
const PER_BATTLE = Number(arg('per-battle') ?? 3);
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

/** The opponent as the app plays it. */
const foe = (m: Matchup): Policy => aiFor({ difficulty: VS, style: m.style, data });

interface Case {
  battle: number;
  turn: number;
  /** Both sides' choices before the decision. */
  p1: string[];
  p2: string[];
  warned: string;
  alt: string;
  text: string;
  position: string;
}

/** The player's choices in order: p1 first each round, as the replay expects. */
function collect(): Case[] {
  const cases: Case[] = [];
  for (let i = 0; i < BATTLES && cases.length < MAX_CASES; i++) {
    const m = matchup(i);
    const session = new BattleSession({ format: FORMAT, ...m });
    const coach = new Coach(data, FORMAT);
    // Beginner-ish players: Easy and the mid bot, alternating.
    const player = i % 2 ? midBot({ data }) : aiFor({ difficulty: 'easy', style: 'balance', data });
    const opponent = foe(m);
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
        const warned = Object.entries(t.warnings).filter(([, n]) => n.rule === RULE);
        const fromHere = cases.filter((c) => c.battle === i).length;
        if (warned.length && cases.length < MAX_CASES && fromHere < PER_BATTLE) {
          // One case per decision, and a few per battle, so no one battle dominates.
          const [choice, note] = warned[Math.floor(pick() * warned.length)]!;
          const scored = scoreActions(view, extractState(view, data), STRONG, () => 0.5, data)
            .filter((s) => !t.warnings[s.choice])
            .sort((a, b) => b.score - a.score);
          const st = extractState(view, data);
          if (scored[0])
            cases.push({
              battle: i,
              turn: session.turn,
              p1: [...session.choices('p1')],
              p2: [...session.choices('p2')],
              warned: choice,
              alt: scored[0].choice,
              text: note.text,
              position:
                `${st.ownActive?.species} ${Math.round(100 * (st.ownActive?.hpFrac ?? 0))}% vs ` +
                `${st.foeActive?.species} ${Math.round(100 * (st.foeActive?.hpFrac ?? 0))}%` +
                (st.ownSide.spikes ? `, your Spikes ${st.ownSide.spikes}` : ''),
            });
        }
        const choice = player.choose(view, rngs.p1);
        coach.record(view, choice);
        if (!session.choose('p1', choice)) coach.forget();
      }
    }
  }
  return cases;
}

/** Plays a case to the end with `first` as the player's choice; 1 a win, 0.5 a tie, 0 a loss. */
function rollout(m: Matchup, c: Case, n: number, first: string, k: number): number {
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
  const opponent = foe(m);
  const rngs = { p1: makeRng(deriveSeed(`${key}:p1`, 0)), p2: makeRng(deriveSeed(`${key}:p2`, 0)) };
  session.choose('p1', first);
  while (!session.ended) {
    for (const side of ['p1', 'p2'] as const) {
      const view = session.view(side);
      if (!view || session.ended) continue;
      const policy = side === 'p1' ? player : opponent;
      const choice = policy.choose(view, rngs[side]);
      if (!session.choose(side, choice)) continue;
    }
  }
  return session.winner === 'p1' ? 1 : session.winner === 'p2' ? 0 : 0.5;
}

const t0 = performance.now();
const cases = collect();
const tCollect = performance.now() - t0;
console.log(
  `${cases.length} ${RULE} cases from up to ${BATTLES} battles vs ${VS} (${(tCollect / 1000).toFixed(1)}s)`,
);

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const results = cases.map((c, n) => {
  const m = matchup(c.battle);
  const a: number[] = [];
  const b: number[] = [];
  for (let k = 0; k < R; k++) {
    a.push(rollout(m, c, n, c.alt, k));
    b.push(rollout(m, c, n, c.warned, k));
  }
  const diffs = a.map((x, k) => x - b[k]!);
  const d = mean(diffs);
  const sd = Math.sqrt(diffs.reduce((s, x) => s + (x - d) ** 2, 0) / Math.max(1, R - 1));
  const r = {
    ...c,
    a: mean(a),
    b: mean(b),
    diff: d,
    se: sd / Math.sqrt(R),
    pass: mean(a) >= mean(b) - 0.02,
  };
  if ((n + 1) % 10 === 0)
    console.log(
      `  ${n + 1}/${cases.length} cases (${((performance.now() - t0) / 1000).toFixed(0)}s)`,
    );
  return r;
});
const tAll = performance.now() - t0;

const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
const diffs = results.map((r) => r.diff);
const d = mean(diffs);
const sd = Math.sqrt(diffs.reduce((s, x) => s + (x - d) ** 2, 0) / Math.max(1, diffs.length - 1));
const ci = 1.96 * (sd / Math.sqrt(diffs.length));
console.log(
  `\n${RULE} vs ${VS}: ${results.length} cases x ${R} rollouts per branch (${(tAll / 1000).toFixed(0)}s)`,
);
console.log(
  `  win rate following the advice ${pct(mean(results.map((r) => r.a)))}, ignoring it ${pct(mean(results.map((r) => r.b)))}`,
);
console.log(
  `  mean gain ${(100 * d).toFixed(1)} points (95% CI ${(100 * (d - ci)).toFixed(1)} to ${(100 * (d + ci)).toFixed(1)})`,
);
console.log(
  `  cases passing (A >= B - 2 points): ${pct(mean(results.map((r) => (r.pass ? 1 : 0))))}`,
);
console.log(
  `  cases clearly worse (A < B by 2 SE): ${results.filter((r) => r.diff < -2 * r.se).length}`,
);
console.log('\nWorst cases:');
for (const r of [...results].sort((x, y) => x.diff - y.diff).slice(0, 5))
  console.log(
    `  battle ${r.battle} turn ${r.turn}: ${r.position}\n    "${r.text}"\n    ${r.alt} ${pct(r.a)} vs ${r.warned} ${pct(r.b)} (gain ${(100 * r.diff).toFixed(0)} ± ${(196 * r.se).toFixed(0)})`,
  );
if (OUT) writeFileSync(OUT, JSON.stringify({ rule: RULE, vs: VS, R, results }, null, 1));
