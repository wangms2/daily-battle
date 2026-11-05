// Calibrates the v7 opponent checks: for days of a published week, plays the
// published (v6) opponent and the v7 build for the same day with the week's pool:
//   - mid bot, first try, vs the Normal AI (the floor: at most 55%),
//   - strong bot vs the Hard AI, on random pool teams and on the recommended team ("beatable").
//   pnpm --filter @daily-battle/pipeline exec tsx scripts/calibrate-v7.ts --format gen4ou --week 2026-11-09 [--days 4] [--mid 200] [--hard 80] [--workers 15]
import { setsFor } from '@daily-battle/data';
import { teammatesFor } from '@daily-battle/data/teammates';
import {
  parseSchedule,
  rngFor,
  styleOf,
  findSet,
  teamSets,
  weekDays,
  type TeamSlot,
} from '@daily-battle/gen';
import { opponentBuilder, type OpponentHistory } from '@daily-battle/gen/builder';
import { readFileSync, writeFileSync } from 'node:fs';
import type { Bot, Job, JobResult } from '../src/job';
import { poolTeams } from '../src/sample';
import { Simulator } from '../src/simulate';
import { publishedDays, scheduleDir } from './published';

const arg = (name: string, d?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1]! : d;
};
const format = arg('format', 'gen4ou')!;
const week = arg('week', '2026-11-09')!;
const dayCount = Number(arg('days', '4'));
const midN = Number(arg('mid', '200'));
const hardN = Number(arg('hard', '80'));
const workers = arg('workers') ? Number(arg('workers')) : undefined;
const data = setsFor(format);

const schedule = parseSchedule(
  JSON.parse(readFileSync(`${scheduleDir(format)}${week}.json`, 'utf8')),
);
const pool = schedule.pool.species;
const randomTeams = poolTeams(pool, 100, rngFor(`pipeline:player-teams:${week}`), data, week).map(
  (t) => teamSets(data, t),
);
const recommended = schedule.suggestedTeams[0]
  ? [teamSets(data, schedule.suggestedTeams[0].team)]
  : [];

const build = opponentBuilder(data, teammatesFor(format));
const history: OpponentHistory = publishedDays(format).filter((d) => d.day < week);
const sim = new Simulator(workers);
console.log(`${format} week ${week}, ${sim.workers} workers; pool: ${pool.join(', ')}`);

const rate = (rs: JobResult[]) => {
  const w =
    rs.filter((r) => r.outcome === 'win').length +
    0.5 * rs.filter((r) => r.outcome === 'tie').length;
  return w / rs.length;
};
async function play(
  team: TeamSlot[],
  bot: Bot,
  difficulty: 'normal' | 'hard',
  players: ReturnType<typeof teamSets>[],
  n: number,
  seed: string,
) {
  const opponent = teamSets(data, team);
  const style = styleOf(team.map((s) => findSet(data, s)));
  const jobs: Job[] = Array.from({ length: n }, (_, k) => ({
    format,
    bot,
    player: players[k % players.length]!,
    opponent,
    style,
    seed,
    index: k,
    difficulty,
    ...(difficulty === 'hard' ? { pool } : {}),
  }));
  return rate(await sim.run(jobs));
}

const rows: Record<string, unknown>[] = [];
try {
  for (const day of weekDays(week).slice(0, dayCount)) {
    const v6 = schedule.days.find((d) => d.day === day)!.team;
    const v7 = build(day, history).team;
    history.push({ day, species: v7.map((s) => s.species) });
    for (const [version, team] of [
      ['v6', v6],
      ['v7', v7],
    ] as const) {
      const t0 = performance.now();
      const mid = await play(team, 'mid', 'normal', randomTeams, midN, `cal7:${day}:mid`);
      const hardRandom = await play(team, 'strong', 'hard', randomTeams, hardN, `cal7:${day}:hard`);
      const hardRec = recommended.length
        ? await play(team, 'strong', 'hard', recommended, hardN, `cal7:${day}:rec`)
        : NaN;
      const row = {
        day,
        version,
        mid,
        hardRandom,
        hardRec,
        secs: Math.round((performance.now() - t0) / 1000),
        team: team.map((s) => s.species),
      };
      rows.push(row);
      console.log(
        `${day} ${version}  mid ${(100 * mid).toFixed(0)}%  strong-vs-Hard random ${(100 * hardRandom).toFixed(0)}%  rec ${(100 * hardRec).toFixed(0)}%  (${row.secs}s)  ${row.team.join(', ')}`,
      );
    }
  }
} finally {
  await sim.close();
}
const out = arg('json');
if (out) writeFileSync(out, JSON.stringify(rows, null, 1));
