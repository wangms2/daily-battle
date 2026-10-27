// Weekly pool validation and the recommended team (DESIGN.md §9.2).
import { sets as defaultSets, type SetsFile } from '@daily-battle/data';
import {
  findSet,
  generateOpponent,
  generatePool,
  rngFor,
  styleOf,
  teamSets,
  type TeamSlot,
  type WeeklyPool,
} from '@daily-battle/gen';
import { PIPELINE } from './config';
import type { Job } from './job';
import { recommendTeam, type Recommendation } from './recommend';
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
  /** The builder's recommended team (none if it couldn't reach the viable win rate). */
  suggested: Recommendation[];
  problems: string[];
  rejected: { candidate: number; stats: PoolStats; problems: string[] }[];
}

type Config = typeof PIPELINE.pool;

/** Win rates of teams against the week's off-schedule probe opponents (mid bot). */
function rater(week: string, candidate: number, sim: Simulator, data: SetsFile, cfg: Config) {
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
            format: data.meta.format,
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
  return winRates;
}

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
  const winRates = rater(week, candidate, sim, data, cfg);
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

  // Pool diversity: viable random teams should come in more than one style.
  const styles = new Set(
    order
      .filter((x) => x.rate >= cfg.viableWinRate)
      .map((x) => styleOf(x.team.map((slot) => findSet(data, slot)))),
  );

  const problems: string[] = [];
  if (stats.viableShare < cfg.minViableShare) {
    problems.push(`only ${pct(stats.viableShare)} of teams are viable`);
  }
  if (stats.bestWinRate > cfg.maxBestWinRate) {
    problems.push(`one team dominates: ${pct(stats.bestWinRate)}`);
  }
  if (styles.size < cfg.minStyles) {
    problems.push(`viable teams come in only ${styles.size} style(s)`);
  }
  return { pool, stats, problems };
}

/** The recommended team, if it's strong enough to recommend. */
export async function recommendedTeams(
  week: string,
  species: string[],
  sim: Simulator,
  data: SetsFile,
  cfg: Config = PIPELINE.pool,
): Promise<Recommendation[]> {
  const rec = await recommendTeam(week, species, sim, data);
  return rec && rec.winRate >= cfg.viableWinRate ? [rec] : [];
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
    if (!result.problems.length) {
      const suggested = await recommendedTeams(week, result.pool.species, sim, data, cfg);
      return { ...result, suggested, candidate, accepted: 'pass', rejected };
    }
    rejected.push({ candidate, stats: result.stats, problems: result.problems });
    if (!best || result.problems.length < best.problems.length) best = { ...result, candidate };
  }
  const suggested = await recommendedTeams(week, best!.pool.species, sim, data, cfg);
  return { ...best!, suggested, accepted: 'closest', rejected };
}
