import { RandomPolicy } from './policies/random';
import { deriveSeed, makeRng } from './rng';
import { runBattle } from './run';
import { randomTeam } from './teams';
import type { BattleResult } from './types';

export interface SoakReport {
  results: BattleResult[];
  errors: { index: number; message: string }[];
}

/**
 * Runs `n` RandomPolicy battles with random teams. Battle `i` depends only on
 * `seed` and `i`, so `only: i` reruns a single battle exactly.
 */
export function soak({ n, seed, only }: { n: number; seed: string; only?: number }): SoakReport {
  const report: SoakReport = { results: [], errors: [] };
  const indices = only === undefined ? [...Array(n).keys()] : [only];
  for (const i of indices) {
    const teamRng = makeRng(deriveSeed(`${seed}:teams`, i));
    try {
      report.results.push(
        runBattle({
          seed: deriveSeed(`${seed}:battle`, i),
          p1: {
            team: randomTeam(teamRng),
            policy: new RandomPolicy(),
            seed: deriveSeed(`${seed}:p1`, i),
          },
          p2: {
            team: randomTeam(teamRng),
            policy: new RandomPolicy(),
            seed: deriveSeed(`${seed}:p2`, i),
          },
        }),
      );
    } catch (e) {
      report.errors.push({ index: i, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return report;
}
