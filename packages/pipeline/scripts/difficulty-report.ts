// Informational: how a mid-skill player fares against a published week's daily
// opponents on each difficulty. Never gates the schedule (only Normal is validated).
//   pnpm --filter @daily-battle/pipeline difficulty-report --week 2026-10-19 [--format gen3ou]
//        [--n 20] [--hard-iterations 150000] [--difficulties easy,normal,hard] [--workers N]
// Hard needs the format's WASM (`pnpm --filter @daily-battle/engine-wasm build:wasm`).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DIFFICULTIES, type Difficulty } from '@daily-battle/ai/version';
import { DEFAULT_FORMAT, genOf, setsFor } from '@daily-battle/data';
import { engineBuilt } from '@daily-battle/engine-wasm/node';
import { mondayOf, parseSchedule, rngFor, teamSets } from '@daily-battle/gen';
import { poolTeams, rateOf, Simulator, type Job } from '../src/index';
import { pct } from '../src/stats';

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const format = arg('format') ?? DEFAULT_FORMAT;
const week = mondayOf(arg('week') ?? new Date().toISOString().slice(0, 10));
const n = Number(arg('n') ?? 20);
const hardIterations =
  arg('hard-iterations') === undefined ? undefined : Number(arg('hard-iterations'));
const workers = arg('workers') === undefined ? undefined : Number(arg('workers'));
const wanted = (arg('difficulties') ?? DIFFICULTIES.join(',')).split(',') as Difficulty[];
const difficulties = wanted.filter((d) => {
  if (d !== 'hard' || engineBuilt(genOf(format))) return true;
  console.error(`Skipping Hard: no ${format} engine built.`);
  return false;
});

const data = setsFor(format);
const sub = format === DEFAULT_FORMAT ? '' : `/${format}`;
const file = fileURLToPath(
  new URL(`../../../apps/web/public/schedule${sub}/${week}.json`, import.meta.url),
);
const schedule = parseSchedule(JSON.parse(readFileSync(file, 'utf8')));
const pool = schedule.pool.species;
const players = poolTeams(pool, n, rngFor(`difficulty-report:${week}`), data).map((t) =>
  teamSets(data, t),
);

const sim = new Simulator(workers);
console.error(
  `${format} ${week}: ${n} battles per day per difficulty on ${sim.workers} worker(s).`,
);
const rows: string[] = [];
const totals = new Map<Difficulty, { wins: number; n: number }>();
try {
  for (const day of schedule.days) {
    const opponent = teamSets(data, day.team);
    const cells: string[] = [];
    for (const difficulty of difficulties) {
      const jobs: Job[] = players.map((player, index) => ({
        format,
        bot: 'mid',
        player,
        opponent,
        style: day.style,
        seed: `difficulty-report:${day.day}:${difficulty}`,
        index,
        difficulty,
        pool,
        ...(hardIterations ? { hardIterations } : {}),
      }));
      const rate = rateOf(await sim.run(jobs));
      const total = totals.get(difficulty) ?? { wins: 0, n: 0 };
      totals.set(difficulty, { wins: total.wins + rate.rate * rate.n, n: total.n + rate.n });
      cells.push(pct(rate.rate));
    }
    rows.push(`| ${day.day} | ${day.style} | ${cells.join(' | ')} |`);
    console.error(rows.at(-1));
  }
} finally {
  await sim.close();
}

const names = difficulties.map((d) => d[0]!.toUpperCase() + d.slice(1));
console.log(`# Mid bot win rate by difficulty: ${format}, week of ${week} (n=${n} per cell)\n`);
console.log(`| Day | Style | ${names.join(' | ')} |`);
console.log(`| --- | --- | ${names.map(() => '---').join(' | ')} |`);
for (const row of rows) console.log(row);
const all = difficulties.map((d) => {
  const t = totals.get(d)!;
  return pct(t.wins / Math.max(1, t.n));
});
console.log(`| **All** | | ${all.join(' | ')} |`);
