// How often the advanced coach speaks in a battle, and what it costs (Phase 2
// validation): coached battles in each gen (a weekly-pool team played by a
// beginner-ish bot against the Normal AI), through the game's own path: the
// basic coach, the network judge, the read veto (the foe's locked-in choice),
// and `Coach.advanced` ahead of the basic tips. Reports tips per decision, by
// kind, and the single-thread time per decision (judge, then the advanced coach).
//   pnpm --filter @daily-battle/tutorial exec tsx scripts/advanced-rate.ts
//     [--battles 20] [--formats gen3ou,gen4ou,gen5ou,gen6ou]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { aiFor, midBot, UtilityPolicy } from '@daily-battle/ai';
import { MASTER_NET_PATH } from '@daily-battle/ai/version';
import { FORMATS, setsFor } from '@daily-battle/data';
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
import { choiceKey, soundPick, type FoeRead } from '../src/coach/judge';
import { NetJudge } from '../src/coach/net-judge';
import { Coach } from '../src/coach/simple';

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const BATTLES = Number(arg('battles') ?? 20);
const FORMAT_LIST = (arg('formats') ?? 'gen3ou,gen4ou,gen5ou,gen6ou').split(',');
const START = '2026-01-05';
const ADVANCED = new Set(['risk', 'hazard', 'pacing', 'read', 'sacrifice']);
const net = new Uint8Array(
  readFileSync(
    join(fileURLToPath(import.meta.url), '../../../../apps/web/public', MASTER_NET_PATH),
  ),
);

const q = (xs: number[], p: number) =>
  [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))] ?? NaN;
const ms = (x: number) => `${Math.round(x)}ms`;

for (const format of FORMAT_LIST) {
  const data = setsFor(format);
  const engine = loadEngine(FORMATS[format as keyof typeof FORMATS].gen);
  engine.netLoad(net);
  const poolTeam = (i: number, week: string) => {
    const rng = rngFor(`advanced-rate:pool-team:${i}`);
    const species = [...generatePool(week, data).species];
    return Array.from({ length: 6 }, () => {
      const name = species.splice(Math.floor(rng() * species.length), 1)[0]!;
      const options = data.species[name]!.sets;
      let r = rng();
      const set = options.find((s) => (r -= s.weight) < 0) ?? options.at(-1)!;
      return toPokemonSet(name, set);
    });
  };
  let decisions = 0;
  let basic = 0;
  const kinds: Record<string, number> = {};
  /** Decisions with an advanced tip found (before pacing and one-time keys). */
  let found = 0;
  const judgeMs: number[] = [];
  const advMs: number[] = [];
  const perBattle: number[] = [];
  const t0 = performance.now();
  for (let i = 0; i < BATTLES; i++) {
    const week = addDays(START, 7 * Math.floor(i / 7));
    const opp = generateOpponent(addDays(week, i % 7), data);
    const pool = generatePool(week, data).species;
    const session = new BattleSession({
      format,
      seed: deriveSeed('advanced-rate:battle', i),
      p1: { team: poolTeam(i, week) },
      p2: { team: teamSets(data, opp.team) },
    });
    const coach = new Coach(data, format, 'normal');
    const judge = new NetJudge(engine, data, { pool });
    const player = i % 2 ? midBot({ data }) : aiFor({ difficulty: 'easy', style: 'balance', data });
    const foe = aiFor({ difficulty: 'normal', style: opp.style, data }) as UtilityPolicy;
    const rngs = {
      p1: makeRng(deriveSeed('advanced-rate:p1', i)),
      p2: makeRng(deriveSeed('advanced-rate:p2', i)),
    };
    let shownHere = 0;
    while (!session.ended) {
      // The foe locks in first, as in the game (the coach's read veto checks against it).
      const fv = session.view('p2');
      const foeChoice = fv ? foe.choose(fv, rngs.p2) : undefined;
      const view = session.view('p1');
      if (view) {
        const t = coach.turn(view);
        let tip = t.tip;
        if (view.request.requestType === 'move' && legalChoices(view.request).length > 1) {
          decisions++;
          const a = performance.now();
          judge.begin(view, `rate:${i}:${session.choices('p1').length}`);
          while (judge.step());
          const b = performance.now();
          judgeMs.push(b - a);
          let sound: ((c: string) => boolean) | undefined;
          if (fv && foeChoice) {
            const likely: Record<string, number> = {};
            for (const { choice, p } of foe.likely(fv)) {
              const k = choiceKey(fv.request, choice);
              if (k) likely[k] = (likely[k] ?? 0) + p;
            }
            const actual = choiceKey(fv.request, foeChoice);
            const read: FoeRead = { likely, ...(actual ? { actual } : {}) };
            const values = judge.against(read);
            if (values) sound = (c) => soundPick(c, values);
          }
          const worlds = judge.searched();
          const top = judge.best;
          if (worlds && top) {
            const adv = coach.advanced(view, {
              worlds,
              legal: legalChoices(view.request),
              top,
              value: (w) => judge.value(w),
              ...(sound ? { sound } : {}),
            });
            advMs.push(performance.now() - b);
            if (coach.advancedMemo(view).review) found++;
            if (adv) tip = adv;
            else if (t.pending) tip = coach.confirm(view, top, sound);
          }
        }
        if (tip) {
          shownHere++;
          if (ADVANCED.has(tip.rule)) kinds[tip.rule] = (kinds[tip.rule] ?? 0) + 1;
          else basic++;
        }
        const choice = player.choose(view, rngs.p1);
        coach.record(view, choice, null);
        if (!session.choose('p1', choice)) coach.forget();
      }
      if (fv && foeChoice && !session.ended && session.view('p2')) session.choose('p2', foeChoice);
    }
    perBattle.push(shownHere);
  }
  const pct = (n: number) => `${((100 * n) / Math.max(1, decisions)).toFixed(1)}%`;
  const advTotal = Object.values(kinds).reduce((a, b) => a + b, 0);
  console.log(
    `\n${format}: ${BATTLES} battles, ${decisions} move decisions (${((performance.now() - t0) / 1000).toFixed(0)}s)`,
  );
  console.log(
    `  advanced shown ${pct(advTotal)} (${Object.entries(kinds)
      .map(([k, n]) => `${k} ${n}`)
      .join(', ')}); basic tips ${pct(basic)}; any tip ${pct(advTotal + basic)}`,
  );
  console.log(`  advanced found (before pacing): ${pct(found)}`);
  console.log(`  tips per battle: median ${q(perBattle, 0.5)}, max ${Math.max(...perBattle)}`);
  console.log(
    `  time per decision, one thread: judge median ${ms(q(judgeMs, 0.5))} p90 ${ms(q(judgeMs, 0.9))};` +
      ` advanced median ${ms(q(advMs, 0.5))} p90 ${ms(q(advMs, 0.9))} max ${ms(Math.max(...advMs))}`,
  );
}
