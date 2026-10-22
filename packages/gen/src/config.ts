/**
 * Bump whenever any output could change: an algorithm change, any value in
 * CONFIG, or a set data refresh. The version is part of every seed key, so
 * past days only change on purpose. The golden test fails until you do.
 */
export const GENERATOR_VERSION = 4;

/** Tiers that count as OU for the pool's below-OU quota; everything else (UU, UUBL, NU, PU...) is below OU. */
export const OU_TIERS = ['OU', '(OU)'];

export const CONFIG = {
  format: 'gen4ou',
  /** Species are drawn with weight usage^exponent; 0.5 favors staples without letting them dominate. */
  usageExponent: 0.5,
  /** Give up on rejection sampling after this many attempts (never hit in practice; see `check`). */
  maxAttempts: 10_000,
  pool: {
    size: 12,
    /** At most `topTierMax` of the `topTierSize` most-used species. */
    topTierSize: 15,
    topTierMax: 4,
    minOffense: 3,
    minDefense: 2,
    minUtility: 2,
    /** Each pool has between these many below-OU species (UU, UUBL, NU, ...), drawn separately. */
    belowOuMin: 2,
    belowOuMax: 4,
    /** Below-OU species are drawn with weight usage^exponent: low enough that no one species dominates, but popular ones still come up more (about 4x the most niche). */
    belowOuUsageExponent: 0.35,
    /** Share of pools that include a Spikes/Toxic Spikes setter (decided per week, then enforced). */
    spikesRate: 0.5,
    /** Chance to accept an otherwise valid pool with no hazard remover. */
    acceptWithoutRemover: 0.5,
  },
  opponent: {
    size: 6,
    maxHazardSetters: 2,
    /** Chance to accept an otherwise valid team that has no hazard remover. */
    acceptWithoutRemover: 0.5,
    /** Style: stall if at least this many defensive sets. */
    stallMinDefense: 3,
    /** Style: offense if no defensive sets and at least this many offensive ones. */
    offenseMinOffense: 4,
  },
  /** Attacking types with at least this share of usage-weighted STAB moves must be checked by the pool. */
  majorTypeMinShare: 0.05,
};
