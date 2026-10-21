// Builds one week's schedule file and validation report (DESIGN.md §6.4, §9.4).
import { sets as defaultSets, type SetsFile } from '@daily-battle/data';
import {
  GENERATOR_VERSION,
  rngFor,
  teamSets,
  weekDays,
  type ScheduleFile,
} from '@daily-battle/gen';
import { PIPELINE } from './config';
import { poolTeams } from './sample';
import type { Simulator } from './simulate';
import { pct } from './stats';
import { poolSetsOf, validateDay, type DayResult } from './validate-opponent';
import { validatePool, type PoolResult } from './validate-pool';

export interface WeekReport {
  week: string;
  generatorVersion: number;
  builtAt: string;
  seconds: number;
  pool: Omit<PoolResult, 'pool'> & { species: string[] };
  days: (Omit<DayResult, 'opponent'> & { day: string; style: string })[];
}

export async function buildWeek(
  week: string,
  sim: Simulator,
  data: SetsFile = defaultSets,
  log: (msg: string) => void = () => {},
): Promise<{ schedule: ScheduleFile; report: WeekReport }> {
  const t0 = performance.now();
  const pool = await validatePool(week, sim, data);
  log(`  pool c${pool.candidate} (${pool.accepted}): ${pool.pool.species.join(', ')}`);

  // Teams a player might bring this week, shared by all seven days.
  const teamCount = Math.ceil(PIPELINE.opponent.samples / 2);
  const playerTeams = poolTeams(
    pool.pool.species,
    teamCount,
    rngFor(`pipeline:player-teams:${week}`),
    data,
  ).map((team) => teamSets(data, team));
  const poolSets = poolSetsOf(pool.pool.species, data);

  const days: DayResult[] = [];
  for (const day of weekDays(week)) {
    const result = await validateDay(day, playerTeams, poolSets, sim, data);
    const m = result.check.metrics;
    log(
      `  ${day} c${result.candidate}`.padEnd(18) +
        `${result.accepted.padEnd(8)} first ${m.uninformed ? pct(m.uninformed.rate) : '-'}` +
        `  retry ${m.informed ? pct(m.informed.rate) : '-'}  (${result.rejected.length} rejected)`,
    );
    days.push(result);
  }

  const schedule: ScheduleFile = {
    version: 1,
    generatorVersion: GENERATOR_VERSION,
    dataBuiltAt: data.meta.builtAt,
    week,
    pool: { species: pool.pool.species, candidate: pool.candidate },
    suggestedTeams: pool.suggested.map(({ archetype, team }) => ({ archetype, team })),
    days: days.map(({ opponent, candidate }) => ({
      day: opponent.day,
      style: opponent.style,
      team: opponent.team,
      candidate,
    })),
  };
  const { pool: _pool, ...poolRest } = pool;
  const report: WeekReport = {
    week,
    generatorVersion: GENERATOR_VERSION,
    builtAt: new Date().toISOString(),
    seconds: Math.round((performance.now() - t0) / 1000),
    pool: { ...poolRest, species: pool.pool.species },
    days: days.map(({ opponent, ...rest }) => ({
      ...rest,
      day: opponent.day,
      style: opponent.style,
    })),
  };
  return { schedule, report };
}

export function reportMarkdown(r: WeekReport): string {
  const lines = [
    `# Week of ${r.week}`,
    '',
    `Generator v${r.generatorVersion}, built ${r.builtAt} in ${r.seconds}s.`,
    '',
    `## Pool (candidate ${r.pool.candidate}, ${r.pool.accepted})`,
    '',
    r.pool.species.join(', '),
    '',
    `Viable teams ${pct(r.pool.stats.viableShare)}, median ${pct(r.pool.stats.medianWinRate)}, best ${pct(r.pool.stats.bestWinRate)} (${r.pool.stats.teams} teams).`,
    `Suggested: ${r.pool.suggested.map((s) => `${s.archetype} (${pct(s.winRate)})`).join(', ')}.`,
    ...(r.pool.rejected.length
      ? [
          '',
          'Rejected pools:',
          ...r.pool.rejected.map((x) => `- c${x.candidate}: ${x.problems.join('; ')}`),
        ]
      : []),
    '',
    '## Days',
    '',
    '| Day | Cand. | Status | Style | First try | Retry | Naive | Strong | Turn caps | Rejected |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const d of r.days) {
    const m = d.check.metrics;
    const f = (x?: { rate: number; ci: [number, number] }) =>
      x ? `${pct(x.rate)} (±${(50 * (x.ci[1] - x.ci[0])).toFixed(1)})` : '-';
    lines.push(
      `| ${d.day} | ${d.candidate} | ${d.accepted} | ${d.style} | ${f(m.uninformed)} | ${f(m.informed)} | ` +
        `${m.naive ? pct(m.naive.rate) : '-'} | ${m.strong ? pct(m.strong.rate) : '-'} | ${pct(m.turnCapRate)} | ${d.rejected.length} |`,
    );
  }
  const rejections = r.days.flatMap((d) =>
    d.rejected.map((x) => `- ${d.day} c${x.candidate}: ${x.check.problems.join('; ')}`),
  );
  if (rejections.length) lines.push('', '## Rejected opponents', '', ...rejections);
  return `${lines.join('\n')}\n`;
}
