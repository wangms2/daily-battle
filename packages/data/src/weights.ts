import { toID } from '@pkmn/sim';
import type { ResolvedSet, UsageShares } from './resolve';

/** Shares below this count as this, so one fringe move doesn't zero a set out. */
export const SHARE_FLOOR = 0.005;
export const MAX_SETS = 4;
/** Sets below this share (after keeping the top MAX_SETS) are dropped. */
export const MIN_WEIGHT = 0.05;

const share = (shares: Map<string, number>, name: string) =>
  Math.max(shares.get(toID(name)) ?? 0, SHARE_FLOOR);

/**
 * How well a set matches observed usage:
 * geomean of move shares × item share × ability share × nature share.
 */
export function scoreSet(set: ResolvedSet, usage: UsageShares): number {
  const logMean =
    set.moves.reduce((sum, m) => sum + Math.log(share(usage.moves, m)), 0) / set.moves.length;
  return (
    Math.exp(logMean) *
    share(usage.items, set.item) *
    share(usage.abilities, set.ability) *
    share(usage.natures, set.nature)
  );
}

/**
 * Keeps the top MAX_SETS by score, drops any under MIN_WEIGHT, and normalizes
 * to weights that sum to 1 (rounded to 4 places). Always keeps the top set.
 */
export function selectAndWeight<T>(
  scored: { item: T; score: number }[],
): { item: T; weight: number }[] {
  const top = [...scored].sort((a, b) => b.score - a.score).slice(0, MAX_SETS);
  const total = top.reduce((s, x) => s + x.score, 0);
  const kept = top.filter((x, i) => i === 0 || x.score / total >= MIN_WEIGHT);
  const keptTotal = kept.reduce((s, x) => s + x.score, 0);

  const weights = kept.map((x) => Math.round((x.score / keptTotal) * 1e4) / 1e4);
  // Put rounding drift on the top set so the weights sum to exactly 1.
  weights[0] = Math.round((1 - weights.slice(1).reduce((a, b) => a + b, 0)) * 1e4) / 1e4;
  return kept.map((x, i) => ({ item: x.item, weight: weights[i]! }));
}
