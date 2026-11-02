/**
 * Bump whenever any output could change: an algorithm change, any value in
 * CONFIG, or a set data refresh. The version is part of every seed key, so
 * past days only change on purpose. The golden test fails until you do.
 */
export const GENERATOR_VERSION = 6;

/** Tiers that count as OU for the pool's below-OU quota; everything else (UU, UUBL, NU, PU...) is below OU. */
export const OU_TIERS = ['OU', '(OU)'];

/**
 * Seed-key prefix for a format. Gen 4 OU keeps the bare keys it launched with,
 * so its published days never change; every other format gets its own keys.
 */
export const seedPrefix = (format: string): string => (format === 'gen4ou' ? '' : `${format}:`);

export const CONFIG = {
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
    /** Chance to accept an otherwise valid pool with no hazard remover. */
    acceptWithoutRemover: 0.5,
    /** Each pool is seeded with this many cores (data/<format>/cores.json), whole. */
    cores: 2,
    /**
     * The cores are drawn once and kept for this many attempts at filling the rest
     * of the pool, so cores that make passing easy (a hazard setter) aren't favoured;
     * a pair that still fails is redrawn.
     */
    coreRedrawEvery: 200,
    /**
     * Rejection-sampling attempts with the full number of cores before trying one
     * core fewer, and again before trying none, so a pool always comes out.
     */
    coreFallbackAfter: 2000,
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
