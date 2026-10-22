import { toID } from '@pkmn/sim';
import type { ResolvedSet, UsageShares } from './resolve';

/** Shares below this count as this, so one fringe move doesn't zero a set out. */
export const SHARE_FLOOR = 0.005;
export const MAX_SETS = 4;
/**
 * Every kept set gets at least this share, so a rarer set (kept for variety)
 * still turns up on opponents now and then.
 */
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
 * Keeps the top MAX_SETS by score and normalizes to weights that sum to 1
 * (rounded to 4 places), lifting any below MIN_WEIGHT up to it. The most used
 * set stays first and keeps the biggest share.
 */
export function selectAndWeight<T>(
  scored: { item: T; score: number }[],
): { item: T; weight: number }[] {
  const kept = [...scored].sort((a, b) => b.score - a.score).slice(0, MAX_SETS);
  const total = kept.reduce((s, x) => s + x.score, 0);
  const raw = kept.map((x) => x.score / total);
  // Lift small shares to the floor, taking the difference from the rest in proportion.
  const low = raw.filter((w) => w < MIN_WEIGHT).length;
  const highTotal = raw.filter((w) => w >= MIN_WEIGHT).reduce((a, b) => a + b, 0);
  const scale = highTotal ? (1 - low * MIN_WEIGHT) / highTotal : 0;
  const weights = raw.map((w) => Math.round((w < MIN_WEIGHT ? MIN_WEIGHT : w * scale) * 1e4) / 1e4);
  // Put rounding drift on the top set so the weights sum to exactly 1.
  weights[0] = Math.round((1 - weights.slice(1).reduce((a, b) => a + b, 0)) * 1e4) / 1e4;
  return kept.map((x, i) => ({ item: x.item, weight: weights[i]! }));
}
