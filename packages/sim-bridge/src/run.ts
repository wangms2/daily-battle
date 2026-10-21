import { makeRng, type Rng } from './rng';
import { BattleError, BattleSession, SIDES } from './session';
import type { BattleResult, Policy, ReplayInput, RunBattleInput, SideID, SideView } from './types';

export { BattleError };

type Chooser = (side: SideID, view: SideView) => string;

/** Runs a battle to the end, asking each side's policy for its choices. */
export function runBattle(input: RunBattleInput): BattleResult {
  const policies: Record<SideID, Policy> = { p1: input.p1.policy, p2: input.p2.policy };
  const rngs: Record<SideID, Rng> = { p1: makeRng(input.p1.seed), p2: makeRng(input.p2.seed) };
  return drive(input, (side, view) => policies[side].choose(view, rngs[side]));
}

/**
 * Re-runs a battle from its seed, teams, and recorded choices. With the same
 * inputs it reproduces the same battle, which is how resume works (DESIGN.md §7).
 */
export function replayBattle(
  input: ReplayInput,
  choices: Record<SideID, readonly string[]>,
): BattleResult {
  const next: Record<SideID, number> = { p1: 0, p2: 0 };
  return drive(input, (side) => {
    const choice = choices[side][next[side]++];
    if (choice === undefined) {
      throw new BattleError('Ran out of recorded choices', { seed: input.seed, turn: -1, side });
    }
    return choice;
  });
}

function drive(input: ReplayInput, chooser: Chooser): BattleResult {
  const session = new BattleSession(input);
  while (!session.ended) {
    let acted = false;
    for (const side of SIDES) {
      const view = session.view(side);
      if (!view) continue;
      session.choose(side, chooser(side, view));
      acted = true;
      if (session.ended) break;
    }
    if (!acted && !session.ended) {
      throw new BattleError('Battle stalled: no side has a pending request', {
        seed: input.seed,
        turn: session.turn,
      });
    }
  }
  return session.result();
}
