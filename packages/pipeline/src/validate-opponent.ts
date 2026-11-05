// Daily opponent validation (DESIGN.md §9.3).
import { bestDamage, genFor, type SetLike } from '@daily-battle/ai';
import { sets as defaultSets, type SetsFile } from '@daily-battle/data';
import { generateOpponent, teamSets, type DailyOpponent, type Style } from '@daily-battle/gen';
import type { OpponentHistory } from '@daily-battle/gen/builder';
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
export function hardCounters(
  opponent: PokemonSet[],
  poolSets: SetLike[],
  min: number,
  data: SetsFile = defaultSets,
): string[] {
  const gen = genFor(data.meta.format);
  return opponent
    .filter((foe) => Math.max(0, ...poolSets.map((s) => bestDamage(gen, s, foe))) < min)
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
  data: SetsFile = defaultSets,
): Promise<OpponentCheck> {
  const metrics: OpponentMetrics = { turnCapRate: 0, hardCounters: [] };
  const problems: string[] = [];
  const all: JobResult[] = [];
  const known = knownSetsOf(opponent, data);
  const play = async (bot: Bot, n: number, start = 0) => {
    const jobs: Job[] = Array.from({ length: n }, (_, k) => ({
      format: data.meta.format,
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

  metrics.hardCounters = hardCounters(opponent, poolSets, cfg.hardCounterMinDamage, data);
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
      data,
    );
    if (!check.problems.length) return { opponent, candidate, accepted: 'pass', check, rejected };
    rejected.push({ candidate, check });
    if (!best || check.distance < best.check.distance) best = { opponent, candidate, check };
  }
  return { ...best!, accepted: 'closest', rejected };
}

/** What a v7 day is checked against: the week's pool and recommended team. */
export interface WeekPlayers {
  /** Teams a player might bring, for the Normal check. */
  playerTeams: PokemonSet[][];
  poolSets: SetLike[];
  /** The pool's species (the Hard AI's prior for unseen foes). */
  pool: string[];
  /** The week's recommended team, for the Hard check; skipped without one. */
  recommended?: PokemonSet[];
}

type ConfigV7 = typeof PIPELINE.opponentV7;

/**
 * Picks a day's v7 opponent (`PIPELINE.opponentV7`). Candidates come from the
 * builder best first, `batch` at a time: each must not wall the pool, and a
 * player's first try against Normal must win in the band (all the batch's
 * games at once). Those in the band then face the slow check in order: the
 * recommended team, played well, beats Hard often enough. The first to pass
 * is the day's; if none does, the closest, leaning too strong (owner: a
 * slightly too strong team beats a weak one).
 * `build` is the v7 builder (`opponentBuilder`); `history` the earlier days, for variety.
 */
export async function validateDayV7(
  day: string,
  build: (day: string, history: OpponentHistory, candidate: number) => DailyOpponent,
  history: OpponentHistory,
  players: WeekPlayers,
  sim: Simulator,
  data: SetsFile = defaultSets,
  cfg: ConfigV7 = PIPELINE.opponentV7,
): Promise<DayResult> {
  const rejected: DayResult['rejected'] = [];
  let best: { opponent: DailyOpponent; candidate: number; check: OpponentCheck } | undefined;
  const job = (
    opponent: PokemonSet[],
    style: Style,
    bot: Bot,
    player: PokemonSet[],
    seed: string,
    index: number,
    hard: boolean,
  ): Job => ({
    format: data.meta.format,
    bot,
    player,
    opponent,
    style,
    seed,
    index,
    ...(hard && { difficulty: 'hard' as const, pool: players.pool }),
  });
  const reject = (c: { opponent: DailyOpponent; candidate: number; check: OpponentCheck }) => {
    rejected.push({ candidate: c.candidate, check: c.check });
    if (!best || c.check.distance < best.check.distance) best = c;
  };
  const capRate = (rs: JobResult[]) => rs.filter((r) => r.turnCap).length / rs.length;

  for (let start = 0; start < cfg.maxCandidates; start += cfg.batch) {
    const batch = Array.from({ length: Math.min(cfg.batch, cfg.maxCandidates - start) }, (_, k) => {
      const candidate = start + k;
      const opponent = build(day, history, candidate);
      const sets = teamSets(data, opponent.team);
      const metrics: OpponentMetrics = {
        turnCapRate: 0,
        hardCounters: hardCounters(sets, players.poolSets, cfg.hardCounterMinDamage, data),
      };
      return { candidate, opponent, sets, metrics, problems: [] as string[] };
    });
    const open = batch.filter((c) => {
      if (!c.metrics.hardCounters.length) return true;
      c.problems.push(
        `hard counter: nothing in the pool hurts ${c.metrics.hardCounters.join(', ')}`,
      );
      reject({ ...c, check: { metrics: c.metrics, problems: c.problems, distance: 1 } });
      return false;
    });

    // Every open candidate's Normal games in one run.
    const jobs = open.flatMap((c) =>
      Array.from({ length: cfg.normalSamples }, (_, k) =>
        job(
          c.sets,
          c.opponent.style,
          'mid',
          players.playerTeams[k % players.playerTeams.length]!,
          `pipeline:v7:${day}:c${c.candidate}:normal`,
          k,
          false,
        ),
      ),
    );
    const results = await sim.run(jobs);
    const inBand: typeof open = [];
    for (const [i, c] of open.entries()) {
      const rs = results.slice(i * cfg.normalSamples, (i + 1) * cfg.normalSamples);
      c.metrics.uninformed = rateOf(rs);
      c.metrics.turnCapRate = capRate(rs);
      const rate = c.metrics.uninformed.rate;
      const d = bandDistance(rate, cfg.normalBand);
      if (d > 0 || c.metrics.turnCapRate > cfg.maxTurnCapRate) {
        const easy = rate > cfg.normalBand[1];
        if (d > 0) {
          c.problems.push(
            `${easy ? 'too easy' : 'too hard'} on Normal: ${pct(rate)} ` +
              `(want ${pct(cfg.normalBand[0])}–${pct(cfg.normalBand[1])})`,
          );
        } else {
          c.problems.push(`stalemates: ${pct(c.metrics.turnCapRate)} hit the turn cap`);
        }
        const distance = d > 0 ? (easy ? 1 + d : d) : 0.5;
        reject({ ...c, check: { metrics: c.metrics, problems: c.problems, distance } });
      } else {
        inBand.push(c);
      }
    }

    // The slow check, best candidate first, until one passes.
    for (const c of inBand) {
      const pass = (): DayResult => ({
        opponent: c.opponent,
        candidate: c.candidate,
        accepted: 'pass',
        check: { metrics: c.metrics, problems: [], distance: 0 },
        rejected,
      });
      if (!players.recommended) return pass();
      const rs = await sim.run(
        Array.from({ length: cfg.hardSamples }, (_, k) =>
          job(
            c.sets,
            c.opponent.style,
            'strong',
            players.recommended!,
            `pipeline:v7:${day}:c${c.candidate}:hard`,
            k,
            true,
          ),
        ),
      );
      c.metrics.strong = rateOf(rs);
      if (c.metrics.strong.rate >= cfg.minBeatable) return pass();
      c.problems.push(
        `too hard on Hard: the recommended team wins ${pct(c.metrics.strong.rate)} ` +
          `(want at least ${pct(cfg.minBeatable)})`,
      );
      reject({
        ...c,
        check: {
          metrics: c.metrics,
          problems: c.problems,
          distance: cfg.minBeatable - c.metrics.strong.rate,
        },
      });
    }
  }
  return { ...best!, accepted: 'closest', rejected };
}
