/** Validation thresholds and sample sizes (DESIGN.md §9). Tune after playtests (M9). */
export const PIPELINE = {
  maxTurns: 300,
  opponent: {
    /** Battles each for the uninformed and informed mid bot. */
    samples: 400,
    /** First-try battles played before deciding whether to run the rest. */
    screenSamples: 100,
    /** Reject after screening if this far outside the band (~2.5 standard errors at 100 battles). */
    screenMargin: 0.12,
    /** Battles each for the naive and strong bots (skill-ordering check only). */
    ladderSamples: 200,
    /** Mid bot first-attempt (uninformed) win-rate band. */
    uninformedBand: [0.45, 0.55] as const,
    /** Mid bot retry (informed) win-rate band. */
    informedBand: [0.35, 0.55] as const,
    /** Strong bot must beat the naive bot's win rate by this much. */
    minSkillGap: 0.1,
    /** Max share of battles that hit the turn cap. */
    maxTurnCapRate: 0.03,
    /** Every opponent Pokémon must take at least this much (fraction of max HP) from some pool set. */
    hardCounterMinDamage: 0.3,
    maxCandidates: 20,
  },
  pool: {
    /** Pool teams sampled for pool validation. */
    teams: 60,
    /** Off-schedule opponents each team plays. */
    opponents: 8,
    seeds: 2,
    /** A team is viable at or above this win rate. */
    viableWinRate: 0.35,
    minViableShare: 0.5,
    /** The top teams are re-tested with more battles before judging dominance. */
    retestTop: 5,
    retestOpponents: 10,
    retestSeeds: 4,
    maxBestWinRate: 0.85,
    /** Viable random teams must come in at least this many styles (pool diversity). */
    minStyles: 2,
    maxCandidates: 8,
    /** Off-schedule opponent candidates start here so they never match a scheduled day's. */
    probeCandidateBase: 100,
  },
  /** The builder's recommended team (DESIGN.md §9.2): searched for, then tested hard. */
  recommend: {
    /** Sets used less than this (share of the species' usage) are left out. */
    minSetWeight: 0.15,
    /** Probe opponents the search plays, and the held-out ones the finalists play. */
    searchProbes: 12,
    finalProbes: 16,
    /** First and second batches: these never match the pool check's probes (100+). */
    searchProbeBase: 200,
    finalProbeBase: 300,
    /** Random rule-meeting teams to start from, and battles per probe while screening. */
    startTeams: 40,
    screenSeeds: 2,
    /** Rounds of one-change tweaks to the leaders, and tweaks tried per round. */
    rounds: 4,
    tweaks: 16,
    /** Leaders re-tested with more battles, then finalists on the held-out probes. */
    retestTop: 8,
    retestSeeds: 6,
    finalists: 3,
    finalSeeds: 6,
  },
};
