// How often the coach would speak (docs/plan-tutorial-coach.md): per player
// decision, the share of picks that get a tip or a warning, in Gen 3 battles
// (a player of the chosen strength against the daily opponent).
//   pnpm --filter @daily-battle/tutorial coach-rate [--battles 30] [--vs easy] [--player easy|mid|hard]
//
// Warnings: what the coach shows (the judge finds the pick clearly worse and a
// true reason explains it), and for comparison the judge alone at each margin
// (any clearly worse pick, explained or not).
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
const judgedAny: Record<number, number> = {};
/** Per battle: decisions, and the warnings the coach shows. */
const battles: { decisions: number; warnings: number; won: boolean }[] = [];
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
    PLAYER === 'mid'
      ? midBot({ data })
      : aiFor({ difficulty: PLAYER as Difficulty, style: 'balance', data, engine, pool });
  const foe = aiFor({ difficulty: VS, style: opp.style, data });
  const rngs = {
    p1: makeRng(deriveSeed('coach-rate:p1', i)),
    p2: makeRng(deriveSeed('coach-rate:p2', i)),
  };
  const here = { decisions: 0, warnings: 0, won: false };
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
        here.decisions++;
        judge.begin(view, `rate:${i}:${session.choices('p1').length}`);
        const v = judge.settle(choice, Infinity);
        const tip =
          t.tip ?? (t.pending && judge.best ? coach.confirm(view, judge.best) : undefined);
        if (tip) tips++;
        if (v && v.agree >= 0.9)
          for (const m of MARGINS) if (v.gap >= m) judgedAny[m] = (judgedAny[m] ?? 0) + 1;
        shown = (v && coach.warn(view, v)) ?? null;
        if (shown) here.warnings++;
      }
      coach.record(view, choice, shown);
      if (!session.choose('p1', choice)) coach.forget();
    }
  }
  here.won = session.winner === 'p1';
  battles.push(here);
  if ((i + 1) % 10 === 0)
    console.log(`  ${i + 1}/${BATTLES} battles (${((performance.now() - t0) / 1000).toFixed(0)}s)`);
}

const pct = (n: number) => `${((100 * n) / decisions).toFixed(1)}%`;
console.log(
  `\n${BATTLES} battles, ${PLAYER} player vs ${VS}: ${decisions} decisions (${(decisions / BATTLES).toFixed(1)} per battle)`,
);
console.log(`  tips: ${pct(tips)} of decisions`);
for (const m of MARGINS)
  console.log(`  judge alone, margin ${m}: ${pct(judgedAny[m] ?? 0)} of picks`);
console.log(`  warnings shown: ${pct(battles.reduce((s, b) => s + b.warnings, 0))} of picks`);
const counts = battles.map((b) => b.warnings).sort((a, b) => a - b);
console.log(
  `  warnings shown per battle: median ${counts[Math.floor(counts.length / 2)]}, max ${counts.at(-1)}, none in ${counts.filter((c) => c === 0).length} of ${counts.length}`,
);
const rate = (bs: typeof battles) =>
  `${(
    (100 * bs.reduce((s, b) => s + b.warnings, 0)) /
    Math.max(
      1,
      bs.reduce((s, b) => s + b.decisions, 0),
    )
  ).toFixed(1)}%`;
console.log(
  `  ...on picks in battles the player won ${rate(battles.filter((b) => b.won))}, lost ${rate(battles.filter((b) => !b.won))}`,
);
