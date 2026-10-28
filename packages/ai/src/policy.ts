import { sets as defaultSets, type SetsFile } from '@daily-battle/data';
import type { Style } from '@daily-battle/gen';
import { legalChoices, type Policy, type Rng, type SideView } from '@daily-battle/sim-bridge';
import type { KnownSets } from './belief';
import { sample, softmax } from './choose';
import { PRESETS, type Params } from './presets';
import { scoreActions, scoreLeads } from './score';
import { extractState } from './state';

/** Running counts for tuning against ladder behavior (§8.5). */
export interface PolicyStats {
  decisions: number;
  /** Voluntary switches (not forced by a faint). */
  switches: number;
  /** Move decisions that picked the highest-damage move. */
  maxDamage: number;
  moveDecisions: number;
  /** Turn of the first hazard move, per battle, if any. */
  firstHazardTurn: number | null;
}

export interface UtilityPolicyOptions {
  data?: SetsFile;
  /** Informed mode: the foe's real sets, keyed by species. Never set for real play. */
  knownSets?: KnownSets;
}

const HAZARD_MOVES = new Set(['stealthrock', 'spikes', 'toxicspikes']);

/** The opponent AI (DESIGN.md §8): utility scoring plus softmax noise. */
export class UtilityPolicy implements Policy {
  readonly stats: PolicyStats = {
    decisions: 0,
    switches: 0,
    maxDamage: 0,
    moveDecisions: 0,
    firstHazardTurn: null,
  };
  private readonly data: SetsFile;
  private readonly known?: KnownSets;

  constructor(
    readonly params: Params,
    options: UtilityPolicyOptions = {},
  ) {
    this.data = options.data ?? defaultSets;
    this.known = options.knownSets;
  }

  choose(view: SideView, rng: Rng): string {
    const legal = legalChoices(view.request);
    if (legal.length <= 1) return legal[0] ?? 'default';
    const state = extractState(view, this.data);
    if (view.request.requestType === 'team') {
      // Team Preview: pick a lead with the same noise as any other choice.
      const scores = scoreLeads(state, this.params, this.data, this.known);
      return legal[sample(softmax(scores, this.params.temperature), rng)]!;
    }
    const actions = scoreActions(view, state, this.params, rng, this.data, this.known);
    const pick =
      actions[
        sample(
          softmax(
            actions.map((a) => a.score),
            this.params.temperature,
          ),
          rng,
        )
      ]!;

    this.stats.decisions++;
    if (view.request.requestType === 'move') {
      if (pick.kind === 'switch') this.stats.switches++;
      const moves = actions.filter((a) => a.kind === 'move');
      if (moves.length) {
        this.stats.moveDecisions++;
        const best = Math.max(...moves.map((a) => a.damage));
        if (pick.kind === 'move' && best > 0 && pick.damage === best) this.stats.maxDamage++;
      }
      if (pick.move && HAZARD_MOVES.has(pick.move) && this.stats.firstHazardTurn === null) {
        this.stats.firstHazardTurn = state.turn;
      }
    }
    return pick.choice;
  }

  /**
   * How likely each legal choice is: the scores and softmax `choose` samples
   * from, with the prediction roll weighed in rather than drawn. For the coach,
   * which reads the opponent's odds without touching the battle's rng.
   */
  likely(view: SideView): { choice: string; p: number }[] {
    const legal = legalChoices(view.request);
    if (legal.length <= 1) return legal.map((choice) => ({ choice, p: 1 }));
    if (view.request.requestType === 'team') return [];
    const state = extractState(view, this.data);
    const probs = (roll: number) =>
      softmax(
        scoreActions(view, state, this.params, () => roll, this.data, this.known).map(
          (a) => a.score,
        ),
        this.params.temperature,
      );
    const rate = Math.min(1, Math.max(0, this.params.predictionRate));
    // A roll of 0 always predicts (when prediction applies); 1 never does.
    const yes = rate > 0 ? probs(0) : undefined;
    const no = rate < 1 ? probs(1) : undefined;
    return legal.map((choice, i) => ({
      choice,
      p: rate * (yes?.[i] ?? 0) + (1 - rate) * (no?.[i] ?? 0),
    }));
  }
}

/** The opponent AI for a daily opponent's style. */
export function aiForStyle(style: Style, options?: UtilityPolicyOptions): UtilityPolicy {
  return new UtilityPolicy(PRESETS[style], options);
}
