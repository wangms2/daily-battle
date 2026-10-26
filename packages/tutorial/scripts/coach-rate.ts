// How often the coach would speak (docs/plan-tutorial-coach.md): per player
// decision, the share of picks that get a warning under each policy, in Gen 3
// battles (a beginner-ish player against the daily opponent).
//   pnpm --filter @daily-battle/tutorial coach-rate [--battles 30] [--vs easy] [--player easy|mid]
//
// Policies compared:
//   - rules: the Simple coach's rules alone (before the judge);
//   - judged rules: a rule warns and the judge agrees (step 2, what ships now);
//   - judged any: the judge alone, whatever the rules say (what step 3's
//     generic explanations would allow), at each margin.
import { aiFor, midBot, type Difficulty } from '@daily-battle/ai';
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
import { BattleSession, deriveSeed, legalChoices, makeRng } from '@daily-battle/sim-bridge';
import { Judge } from '../src/coach/judge';
import { Coach } from '../src/coach/simple';

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const FORMAT = 'gen3ou';
const BATTLES = Number(arg('battles') ?? 30);
const VS = (arg('vs') ?? 'easy') as Difficulty;
const PLAYER = arg('player') ?? 'easy';
const MARGINS = [0.05, 0.1, 0.15, 0.2];
const START = '2026-01-05';
const data = setsFor(FORMAT);
const engine = loadEngine(3);
type PokemonSet = ReturnType<typeof toPokemonSet>;

function poolTeam(i: number, week: string): PokemonSet[] {
  const rng = rngFor(`coach-rate:pool-team:${i}`);
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

let decisions = 0;
let tips = 0;
let rules = 0;
const judgedRules: Record<number, number> = {};
const judgedAny: Record<number, number> = {};
const perBattle: number[] = [];
const t0 = performance.now();
for (let i = 0; i < BATTLES; i++) {
  const week = addDays(START, 7 * Math.floor(i / 7));
  const day = addDays(week, i % 7);
  const opp = generateOpponent(day, data);
  const pool = generatePool(week, data).species;
  const session = new BattleSession({
    format: FORMAT,
    seed: deriveSeed('coach-rate:battle', i),
    p1: { team: poolTeam(i, week) },
    p2: { team: teamSets(data, opp.team) },
  });
  const coach = new Coach(data, FORMAT);
  const judge = new Judge(engine, data, { pool });
  const player =
    PLAYER === 'mid' ? midBot({ data }) : aiFor({ difficulty: 'easy', style: 'balance', data });
  const foe = aiFor({ difficulty: VS, style: opp.style, data });
  const rngs = {
    p1: makeRng(deriveSeed('coach-rate:p1', i)),
    p2: makeRng(deriveSeed('coach-rate:p2', i)),
  };
  let warnedHere = 0;
  while (!session.ended) {
    for (const side of ['p1', 'p2'] as const) {
      const view = session.view(side);
      if (!view || session.ended) continue;
      if (side === 'p2') {
        session.choose('p2', foe.choose(view, rngs.p2));
        continue;
      }
      const t = coach.turn(view);
      const choice = player.choose(view, rngs.p1);
      let shown = null;
      if (view.request.requestType === 'move' && legalChoices(view.request).length > 1) {
        decisions++;
        if (t.tip) tips++;
        const note = t.warnings[choice];
        if (note) rules++;
        judge.begin(view, `rate:${i}:${session.choices('p1').length}`);
        const v = judge.settle(choice, Infinity);
        if (v && v.agree >= 0.9)
          for (const m of MARGINS)
            if (v.gap >= m) {
              judgedAny[m] = (judgedAny[m] ?? 0) + 1;
              if (note) judgedRules[m] = (judgedRules[m] ?? 0) + 1;
            }
        if (note && v && v.agree >= 0.9 && v.gap >= 0.1) {
          shown = note;
          warnedHere++;
        }
      }
      coach.record(view, choice, shown);
      if (!session.choose('p1', choice)) coach.forget();
    }
  }
  perBattle.push(warnedHere);
  if ((i + 1) % 10 === 0)
    console.log(`  ${i + 1}/${BATTLES} battles (${((performance.now() - t0) / 1000).toFixed(0)}s)`);
}

const pct = (n: number) => `${((100 * n) / decisions).toFixed(1)}%`;
console.log(
  `\n${BATTLES} battles, ${PLAYER} player vs ${VS}: ${decisions} decisions (${(decisions / BATTLES).toFixed(1)} per battle)`,
);
console.log(`  tips: ${pct(tips)} of decisions`);
console.log(`  rules alone would warn on ${pct(rules)} of picks`);
for (const m of MARGINS)
  console.log(
    `  margin ${m}: judged rules ${pct(judgedRules[m] ?? 0)}, judge alone ${pct(judgedAny[m] ?? 0)} of picks`,
  );
const sorted = [...perBattle].sort((a, b) => a - b);
console.log(
  `  shipped warnings (judged rules, margin 0.1) per battle: median ${sorted[Math.floor(sorted.length / 2)]}, max ${sorted.at(-1)}`,
);
