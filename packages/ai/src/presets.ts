import type { Style } from '@daily-battle/gen';

/**
 * Utility weights and noise (DESIGN.md §8.3–8.5). Scores are in units of
 * "fraction of a Pokémon's HP", so 0.5 is worth about half a Pokémon.
 */
export interface Params {
  /** Softmax temperature; lower is greedier. */
  temperature: number;
  /** Per unit of expected damage dealt (fraction of target's max HP). */
  damage: number;
  /** Per unit of KO probability (when we survive to land it). */
  ko: number;
  /** Per unit of expected damage taken this turn. */
  risk: number;
  /** Setting a hazard that isn't up yet (scaled by foes left). */
  hazard: number;
  /** Extra multiplier on hazard value in the first turns. */
  earlyHazardBonus: number;
  /** Removing our own hazards. */
  spin: number;
  /** A boosting move when it's safe. */
  setup: number;
  /** Inflicting status on a healthy, non-immune target. */
  status: number;
  /** Healing, per unit of missing HP. */
  recover: number;
  /** Putting up a Substitute when it's safe. */
  substitute: number;
  /** Any other status move. */
  other: number;
  /** Per unit of matchup gain from switching. */
  position: number;
  /** Fixed cost of switching (higher means fewer switches). */
  switchPenalty: number;
  /** Bonus for switching to something that resists the foe's attacks. */
  resistBias: number;
  /** Bonus for the highest-damage move (average players click it a lot). */
  maxDamageBias: number;
  /** Chance to aim attacks at the foe's likely switch-in when it's threatened. */
  predictionRate: number;
  /** Mega Evolving now (Gen 6 on), on top of the move's score in Mega form: the boost lasts all battle. */
  mega: number;
  /**
   * Cost of switching straight back to the Pokémon that just left, doubling
   * each time the same two keep swapping (AI version 2).
   */
  switchBack: number;
  /**
   * AI version 1's scoring: no switch-back cost, and no sure-KO rule. Kept
   * so battles saved under version 1 resume exactly (DESIGN.md §15).
   */
  legacy?: boolean;
}

/** These weights scored as AI version 1 did. */
export const legacy = (params: Params): Params => ({ ...params, legacy: true });

const BALANCE: Params = {
  temperature: 0.12,
  damage: 1,
  ko: 0.6,
  risk: 0.6,
  hazard: 0.45,
  earlyHazardBonus: 0.5,
  spin: 0.5,
  setup: 0.4,
  status: 0.35,
  recover: 0.8,
  substitute: 0.3,
  other: 0.05,
  position: 0.6,
  switchPenalty: 0.15,
  resistBias: 0.08,
  maxDamageBias: 0.1,
  predictionRate: 0.15,
  mega: 0.2,
  switchBack: 0.5,
};

export const PRESETS: Record<Style, Params> = {
  balance: BALANCE,
  offense: {
    ...BALANCE,
    damage: 1.15,
    ko: 0.7,
    risk: 0.5,
    hazard: 0.35,
    setup: 0.55,
    status: 0.25,
    recover: 0.5,
    switchPenalty: 0.22,
    maxDamageBias: 0.15,
  },
  stall: {
    ...BALANCE,
    damage: 0.85,
    risk: 0.75,
    hazard: 0.55,
    status: 0.5,
    recover: 0.9,
    switchPenalty: 0.1,
    position: 0.7,
    resistBias: 0.12,
  },
};

/** The stronger comparison bot (§9.1): same features, less noise, no deliberate biases or guessing. */
export const STRONG: Params = {
  ...BALANCE,
  temperature: 0.03,
  damage: 1.1,
  ko: 0.75,
  maxDamageBias: 0,
  resistBias: 0,
  predictionRate: 0,
};

/**
 * Easy difficulty: a beginner who mostly clicks attacks (not always the best
 * one), rarely switches, ignores hazards and setup, and never predicts. Used
 * for every team style.
 */
export const EASY: Params = {
  ...BALANCE,
  temperature: 0.3,
  ko: 0.2,
  risk: 0.1,
  hazard: 0,
  earlyHazardBonus: 0,
  spin: 0,
  setup: 0,
  status: 0.05,
  recover: 0.3,
  substitute: 0,
  other: 0,
  position: 0.2,
  switchPenalty: 0.6,
  resistBias: 0,
  maxDamageBias: 0,
  predictionRate: 0,
  mega: 0.5,
};
