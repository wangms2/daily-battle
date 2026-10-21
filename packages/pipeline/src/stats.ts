import type { JobResult } from './job';

export interface Rate {
  wins: number;
  losses: number;
  ties: number;
  n: number;
  /** Player win rate, ties counting half. */
  rate: number;
  /** 95% confidence interval (normal approximation). */
  ci: [number, number];
}

export function rateOf(results: JobResult[]): Rate {
  const wins = results.filter((r) => r.outcome === 'win').length;
  const losses = results.filter((r) => r.outcome === 'loss').length;
  const ties = results.length - wins - losses;
  const n = Math.max(1, results.length);
  const rate = (wins + ties / 2) / n;
  const half = 1.96 * Math.sqrt((rate * (1 - rate)) / n);
  return { wins, losses, ties, n: results.length, rate, ci: [rate - half, rate + half] };
}

/** How far a rate sits outside a band (0 inside). */
export function bandDistance(rate: number, [lo, hi]: readonly [number, number]): number {
  return rate < lo ? lo - rate : rate > hi ? rate - hi : 0;
}

export const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
