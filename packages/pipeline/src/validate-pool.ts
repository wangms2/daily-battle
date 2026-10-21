// Weekly pool validation and suggested teams (DESIGN.md §9.2).
import { sets as defaultSets, type SetsFile } from '@daily-battle/data';
import {
  findSet,
  generateOpponent,
  generatePool,
  rngFor,
  styleOf,
  teamSets,
  type Archetype,
  type TeamSlot,
  type WeeklyPool,
} from '@daily-battle/gen';
import { PIPELINE } from './config';
import type { Job } from './job';
import { poolTeams } from './sample';
import type { Simulator } from './simulate';
import { pct } from './stats';

export interface PoolStats {
  teams: number;
  viableShare: number;
  bestWinRate: number;
  medianWinRate: number;
}

export interface PoolResult {
  pool: WeeklyPool;
  candidate: number;
  accepted: 'pass' | 'closest';
  stats: PoolStats;
  suggested: { archetype: Archetype; team: TeamSlot[]; winRate: number }[];
  problems: string[];
  rejected: { candidate: number; stats: PoolStats; problems: string[] }[];
}

const ARCHETYPE = { balance: 'Balanced', offense: 'Offense', stall: 'Stall' } as const;

type Config = typeof PIPELINE.pool;

async function checkPool(
  week: string,
  candidate: number,
  sim: Simulator,
  data: SetsFile,
  cfg: Config,
) {
  const pool = generatePool(week, data, candidate);
  const teams = poolTeams(
    pool.species,
    cfg.teams,
    rngFor(`pipeline:pool-teams:${week}:c${candidate}`),
    data,
  );
  const probes = Array.from({ length: Math.max(cfg.opponents, cfg.retestOpponents) }, (_, k) =>
    generateOpponent(week, data, cfg.probeCandidateBase + k),
  );

  /** Win rate of each team against the first `opponents` probes, `seeds` battles each. */
  const winRates = async (group: TeamSlot[][], opponents: number, seeds: number, tag: string) => {
    const jobs: Job[] = [];
    group.forEach((team, t) =>
      probes.slice(0, opponents).forEach((probe, p) => {
        for (let s = 0; s < seeds; s++) {
          jobs.push({
            bot: 'mid',
            player: teamSets(data, team),
            opponent: teamSets(data, probe.team),
            style: probe.style,
            seed: `pipeline:pool:${week}:c${candidate}:${tag}`,
            index: (t * opponents + p) * seeds + s,
          });
        }
      }),
    );
    const results = await sim.run(jobs);
    const per = opponents * seeds;
    return group.map(
      (_, t) =>
        results
          .slice(t * per, (t + 1) * per)
          .reduce((a, r) => a + (r.outcome === 'win' ? 1 : r.outcome === 'tie' ? 0.5 : 0), 0) / per,
    );
  };

  const rates = await winRates(teams, cfg.opponents, cfg.seeds, 'screen');
  const order = teams.map((team, t) => ({ team, rate: rates[t]! })).sort((a, b) => b.rate - a.rate);
  // A team's best-of-60 rate over few battles is mostly luck; re-test the leaders properly.
  const top = order.slice(0, cfg.retestTop);
  const retested = await winRates(
    top.map((x) => x.team),
    cfg.retestOpponents,
    cfg.retestSeeds,
    'retest',
  );
  top.forEach((x, i) => (x.rate = retested[i]!));
  order.sort((a, b) => b.rate - a.rate);

  const sorted = [...rates].sort((a, b) => a - b);
  const stats: PoolStats = {
    teams: teams.length,
    viableShare: rates.filter((r) => r >= cfg.viableWinRate).length / rates.length,
    bestWinRate: Math.max(...retested),
    medianWinRate: sorted[Math.floor(sorted.length / 2)]!,
  };

  // The best viable team of each archetype.
  const suggested: PoolResult['suggested'] = [];
  for (const { team, rate } of order) {
    if (rate < cfg.viableWinRate) break;
    const archetype = ARCHETYPE[styleOf(team.map((slot) => findSet(data, slot)))];
    if (!suggested.some((s) => s.archetype === archetype))
      suggested.push({ archetype, team, winRate: rate });
  }
  const archetypeOrder: Archetype[] = ['Balanced', 'Offense', 'Stall'];
  suggested.sort(
    (a, b) => archetypeOrder.indexOf(a.archetype) - archetypeOrder.indexOf(b.archetype),
  );

  const problems: string[] = [];
  if (stats.viableShare < cfg.minViableShare) {
    problems.push(`only ${pct(stats.viableShare)} of teams are viable`);
  }
  if (stats.bestWinRate > cfg.maxBestWinRate) {
    problems.push(`one team dominates: ${pct(stats.bestWinRate)}`);
  }
  if (suggested.length < cfg.minSuggested) {
    problems.push(`only ${suggested.length} distinct suggested archetype(s)`);
  }
  return { pool, stats, suggested, problems };
}

/** Tries pool candidates for a week until one passes; otherwise keeps the closest. */
export async function validatePool(
  week: string,
  sim: Simulator,
  data: SetsFile = defaultSets,
  cfg: Config = PIPELINE.pool,
): Promise<PoolResult> {
  const rejected: PoolResult['rejected'] = [];
  let best: (Awaited<ReturnType<typeof checkPool>> & { candidate: number }) | undefined;
  for (let candidate = 0; candidate < cfg.maxCandidates; candidate++) {
    const result = await checkPool(week, candidate, sim, data, cfg);
    if (!result.problems.length) return { ...result, candidate, accepted: 'pass', rejected };
    rejected.push({ candidate, stats: result.stats, problems: result.problems });
    if (!best || result.problems.length < best.problems.length) best = { ...result, candidate };
  }
  return { ...best!, accepted: 'closest', rejected };
}
