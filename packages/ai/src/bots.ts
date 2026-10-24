// Comparison bots for evaluation and validation (DESIGN.md §9.1).
import { sets as defaultSets, type SetsFile } from '@daily-battle/data';
import { legalChoices, type Policy, type Rng, type SideView } from '@daily-battle/sim-bridge';
import { UtilityPolicy, type UtilityPolicyOptions } from './policy';
import { PRESETS, STRONG } from './presets';
import { scoreActions } from './score';
import { extractState } from './state';
import type { Params } from './presets';

/** Weights that make scoreActions rank moves by raw expected damage only. */
const DAMAGE_ONLY: Params = {
  ...PRESETS.balance,
  temperature: 0,
  ko: 0,
  risk: 0,
  hazard: 0,
  spin: 0,
  setup: 0,
  status: 0,
  recover: 0,
  substitute: 0,
  other: 0,
  maxDamageBias: 0,
  predictionRate: 0,
  resistBias: 0,
  mega: 0,
};

/**
 * Naive bot: always uses its highest expected-damage move and never switches
 * voluntarily. When forced to switch, brings in the best damage matchup.
 */
export class NaivePolicy implements Policy {
  constructor(private readonly data: SetsFile = defaultSets) {}

  choose(view: SideView, rng: Rng): string {
    const legal = legalChoices(view.request);
    // At Team Preview it leads with its first Pokémon, as Gen 4 teams do.
    if (legal.length <= 1 || view.request.requestType === 'team') return legal[0] ?? 'default';
    const state = extractState(view, this.data);
    const actions = scoreActions(view, state, DAMAGE_ONLY, rng, this.data);
    const moves = actions.filter((a) => a.kind === 'move');
    const pool = moves.length ? moves : actions;
    const best = pool.reduce((a, b) =>
      (moves.length ? b.damage > a.damage : b.score > a.score) ? b : a,
    );
    return best.choice;
  }
}

export const midBot = (options?: UtilityPolicyOptions) =>
  new UtilityPolicy(PRESETS.balance, options);
export const strongBot = (options?: UtilityPolicyOptions) => new UtilityPolicy(STRONG, options);
