// Daily opponent validation (DESIGN.md §9.3).
import { bestDamage, type SetLike } from '@daily-battle/ai';
import { sets as defaultSets, type SetsFile } from '@daily-battle/data';
import { generateOpponent, teamSets, type DailyOpponent, type Style } from '@daily-battle/gen';
import type { PokemonSet } from '@pkmn/sim';
import { PIPELINE } from './config';
import type { Bot, Job, JobResult } from './job';
import { knownSetsOf } from './sample';
import type { Simulator } from './simulate';
import { bandDistance, pct, rateOf, type Rate } from './stats';

export interface OpponentMetrics {
  uninformed?: Rate;
  informed?: Rate;
  naive?: Rate;
  strong?: Rate;
  turnCapRate: number;
  hardCounters: string[];
  /** Average crits/misses per battle in uninformed games (report only). */
  luck?: {
    playerCrits: number;
    opponentCrits: number;
    playerMisses: number;
    opponentMisses: number;
  };
}

export interface OpponentCheck {
  metrics: OpponentMetrics;
  problems: string[];
  /** Distance outside the bands, for picking the closest candidate if none pass. */
  distance: number;
}

type Config = typeof PIPELINE.opponent;

/** Opponent Pokémon that no set in the pool can meaningfully damage. */
export function hardCounters(opponent: PokemonSet[], poolSets: SetLike[], min: number): string[] {
  return opponent
    .filter((foe) => Math.max(0, ...poolSets.map((s) => bestDamage(s, foe))) < min)
    .map((foe) => foe.species);
}

export function poolSetsOf(species: string[], data: SetsFile = defaultSets): SetLike[] {
  return species.flatMap((name) => data.species[name]!.sets.map((s) => ({ species: name, ...s })));
}

/**
 * Checks one opponent team against teams a player might bring. Stops at the
 * first failing stage, since later stages are the expensive ones.
 */
export async function checkOpponent(
  opponent: PokemonSet[],
  style: Style,
  playerTeams: PokemonSet[][],
  poolSets: SetLike[],
  sim: Simulator,
  seed: string,
  cfg: Config = PIPELINE.opponent,
): Promise<OpponentCheck> {
  const metrics: OpponentMetrics = { turnCapRate: 0, hardCounters: [] };
  const problems: string[] = [];
  const all: JobResult[] = [];
  const known = knownSetsOf(opponent);
  const play = async (bot: Bot, n: number, start = 0) => {
    const jobs: Job[] = Array.from({ length: n }, (_, k) => ({
      bot,
      player: playerTeams[(start + k) % playerTeams.length]!,
      opponent,
      style,
      known: bot === 'informed' ? known : undefined,
      seed: `${seed}:${bot}`,
      index: start + k,
    }));
    const results = await sim.run(jobs);
    all.push(...results);
    return results;
  };
  const finish = (distance: number): OpponentCheck => {
    metrics.turnCapRate = all.length ? all.filter((r) => r.turnCap).length / all.length : 0;
    if (metrics.turnCapRate > cfg.maxTurnCapRate) {
      problems.push(`stalemates: ${pct(metrics.turnCapRate)} hit the turn cap`);
    }
    return { metrics, problems, distance };
  };

  metrics.hardCounters = hardCounters(opponent, poolSets, cfg.hardCounterMinDamage);
  if (metrics.hardCounters.length) {
    problems.push(`hard counter: nothing in the pool hurts ${metrics.hardCounters.join(', ')}`);
    return finish(1);
  }

  // Screen with a smaller sample first: clear misses don't need the full 400.
  const screen = Math.min(cfg.screenSamples, cfg.samples);
  const uninformed = await play('mid', screen);
  const screened = bandDistance(rateOf(uninformed).rate, cfg.uninformedBand);
  if (screened <= cfg.screenMargin)
    uninformed.push(...(await play('mid', cfg.samples - screen, screen)));
  metrics.uninformed = rateOf(uninformed);
  const avg = (f: (r: JobResult) => number) =>
    uninformed.reduce((a, r) => a + f(r), 0) / uninformed.length;
  metrics.luck = {
    playerCrits: avg((r) => r.playerCrits),
    opponentCrits: avg((r) => r.opponentCrits),
    playerMisses: avg((r) => r.playerMisses),
    opponentMisses: avg((r) => r.opponentMisses),
  };
  const d1 = bandDistance(metrics.uninformed.rate, cfg.uninformedBand);
  if (d1 > 0) {
    problems.push(
      `${metrics.uninformed.rate > cfg.uninformedBand[1] ? 'too easy' : 'too hard'} on a first try: ` +
        `${pct(metrics.uninformed.rate)} (want ${pct(cfg.uninformedBand[0])}–${pct(cfg.uninformedBand[1])})`,
    );
    return finish(d1);
  }

  metrics.informed = rateOf(await play('informed', cfg.samples));
  const d2 = bandDistance(metrics.informed.rate, cfg.informedBand);
  if (d2 > 0) {
    problems.push(
      `${metrics.informed.rate > cfg.informedBand[1] ? 'too easy' : 'too hard'} on retries: ` +
        `${pct(metrics.informed.rate)} (want ${pct(cfg.informedBand[0])}–${pct(cfg.informedBand[1])})`,
    );
    return finish(d2);
  }

  metrics.naive = rateOf(await play('naive', cfg.ladderSamples));
  metrics.strong = rateOf(await play('strong', cfg.ladderSamples));
  const gap = metrics.strong.rate - metrics.naive.rate;
  if (gap < cfg.minSkillGap) {
    problems.push(
      `skill barely matters: strong ${pct(metrics.strong.rate)} vs naive ${pct(metrics.naive.rate)}`,
    );
    return finish(cfg.minSkillGap - gap);
  }
  return finish(0);
}

export interface DayResult {
  opponent: DailyOpponent;
  candidate: number;
  accepted: 'pass' | 'closest';
  check: OpponentCheck;
  rejected: { candidate: number; check: OpponentCheck }[];
}

/** Tries candidates for a day until one passes; otherwise keeps the closest. */
export async function validateDay(
  day: string,
  playerTeams: PokemonSet[][],
  poolSets: SetLike[],
  sim: Simulator,
  data: SetsFile = defaultSets,
  cfg: Config = PIPELINE.opponent,
): Promise<DayResult> {
  const rejected: DayResult['rejected'] = [];
  let best: { opponent: DailyOpponent; candidate: number; check: OpponentCheck } | undefined;
  for (let candidate = 0; candidate < cfg.maxCandidates; candidate++) {
    const opponent = generateOpponent(day, data, candidate);
    const check = await checkOpponent(
      teamSets(data, opponent.team),
      opponent.style,
      playerTeams,
      poolSets,
      sim,
      `pipeline:${day}:c${candidate}`,
      cfg,
    );
    if (!check.problems.length) return { opponent, candidate, accepted: 'pass', check, rejected };
    rejected.push({ candidate, check });
    if (!best || check.distance < best.check.distance) best = { opponent, candidate, check };
  }
  return { ...best!, accepted: 'closest', rejected };
}
