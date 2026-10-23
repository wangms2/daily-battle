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
import { archetypeTeams } from './archetypes';
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
  if (styles.size < cfg.minSuggested) {
    problems.push(`only ${styles.size} distinct suggested archetype(s)`);
  }
  return { pool, stats, problems };
}

const ARCHETYPES: Archetype[] = ['Balanced', 'Offense', 'Stall'];

/**
 * The strongest viable team of each archetype, built to that archetype's rules
 * (archetypes.ts) rather than labelled after the fact, so "Stall" is walls and
 * "Offense" is attackers. An archetype the pool can't field is left out.
 */
async function suggestTeams(
  week: string,
  candidate: number,
  pool: WeeklyPool,
  sim: Simulator,
  data: SetsFile,
  cfg: Config,
): Promise<PoolResult['suggested']> {
  const winRates = rater(week, candidate, sim, data, cfg);
  const suggested: PoolResult['suggested'] = [];
  for (const archetype of ARCHETYPES) {
    const teams = archetypeTeams(
      pool.species,
      archetype,
      cfg.suggestTeams,
      rngFor(`pipeline:suggest:${week}:c${candidate}:${archetype}`),
      data,
    );
    if (!teams.length) continue;
    const tag = `suggest-${archetype}`;
    const rates = await winRates(teams, cfg.opponents, cfg.seeds, tag);
    const top = teams
      .map((team, t) => ({ team, rate: rates[t]! }))
      .sort((a, b) => b.rate - a.rate)
      .slice(0, cfg.suggestRetestTop);
    const retested = await winRates(
      top.map((x) => x.team),
      cfg.retestOpponents,
      cfg.retestSeeds,
      `${tag}-retest`,
    );
    top.forEach((x, i) => (x.rate = retested[i]!));
    top.sort((a, b) => b.rate - a.rate);
    const best = top[0]!;
    if (best.rate >= cfg.viableWinRate) suggested.push({ archetype, ...best, winRate: best.rate });
  }
  return suggested.map(({ archetype, team, winRate }) => ({ archetype, team, winRate }));
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
      const suggested = await suggestTeams(week, candidate, result.pool, sim, data, cfg);
      return { ...result, suggested, candidate, accepted: 'pass', rejected };
    }
    rejected.push({ candidate, stats: result.stats, problems: result.problems });
    if (!best || result.problems.length < best.problems.length) best = { ...result, candidate };
  }
  const suggested = await suggestTeams(week, best!.candidate, best!.pool, sim, data, cfg);
  return { ...best!, suggested, accepted: 'closest', rejected };
}
