import type { Battle as ClientBattle } from '@pkmn/client';
import type { Protocol } from '@pkmn/protocol';
import type { PokemonSet, PRNGSeed } from '@pkmn/sim';
import type { Rng } from './rng';

export type SideID = 'p1' | 'p2';

/**
 * Everything a policy may see when it chooses: its own request plus the
 * battle as reconstructed from its own side's protocol channel. Nothing here
 * is derived from the opponent's request or the sim's internal state.
 */
export interface SideView {
  readonly side: SideID;
  readonly request: Protocol.Request;
  /** Battle state from this side's perspective. Treat as read-only. */
  readonly battle: ClientBattle;
  /** This side's protocol lines so far (live; copy if you need a snapshot). */
  readonly log: readonly string[];
}

export interface Policy {
  /** Returns a choice string such as `move 2`, `switch 4`, or `default`. */
  choose(view: SideView, rng: Rng): string;
}

export interface PlayerInput {
  team: PokemonSet[];
  policy: Policy;
  /** Seed for the rng handed to this side's policy. */
  seed: PRNGSeed;
}

export interface RunBattleInput {
  /** Sim format id, e.g. `gen4ou` (the default). */
  format?: string;
  /** Battle seed: damage rolls, crits, accuracy, and so on. */
  seed: PRNGSeed;
  /** Force a tie once this many turns have been played. */
  maxTurns?: number;
  /**
   * Tutorial battles: chance rolls of 50% or more always happen and the rest
   * never do (moves hit, no crits, no full paralysis, no secondary effects).
   * Damage rolls and durations (sleep turns) stay random.
   */
  noLuck?: boolean;
  p1: PlayerInput;
  p2: PlayerInput;
}

/** What `replayBattle` needs: the battle inputs without policies. */
export type ReplayInput = Omit<RunBattleInput, 'p1' | 'p2'> &
  Record<SideID, Pick<PlayerInput, 'team'> & { name?: string }>;

export interface BattleResult {
  winner: SideID | null;
  turns: number;
  endReason: 'win' | 'tie' | 'turnCap';
  /** Every choice each side made, in order; enough to replay the battle. */
  choices: Record<SideID, string[]>;
  /** Public protocol log, with no private split lines. */
  spectatorLog: string[];
}
