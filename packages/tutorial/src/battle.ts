import { aiFor } from '@daily-battle/ai';
import { setsFor } from '@daily-battle/data';
import {
  BattleSession,
  deriveSeed,
  resolveStep,
  SIDES,
  type Policy,
  type RunBattleInput,
} from '@daily-battle/sim-bridge';
import { teamOf } from './teams';
import type { BattleStep, Position } from './types';

/** Replays a lesson position (no luck) and returns the session at the player's (p1's) decision. */
export function startPosition(format: string, position: Position): BattleSession {
  const session = new BattleSession({
    format,
    seed: deriveSeed(position.seed, 0),
    noLuck: true,
    // Named as in the app's battles, so the battle text reads the same.
    p1: { team: teamOf(format, position.p1), name: 'You' },
    p2: { team: teamOf(format, position.p2), name: 'The opponent' },
  });
  for (const side of SIDES)
    for (const [slot, pct] of (position.hp?.[side] ?? []).entries())
      if (pct !== null) session.setHp(side, slot, pct / 100);
  for (const [i, round] of (position.rounds ?? []).entries()) {
    for (const side of SIDES) {
      const request = session.request(side);
      const step = round[side];
      if (!request) {
        if (step) throw new Error(`Round ${i + 1}: ${side} has nothing to choose ("${step}")`);
        continue;
      }
      if (!step) throw new Error(`Round ${i + 1}: ${side} must choose`);
      const choice = resolveStep(step, request);
      if (!choice) throw new Error(`Round ${i + 1}: "${step}" isn't legal for ${side}`);
      session.choose(side, choice);
    }
  }
  if (!session.request('p1')) throw new Error('The position has no decision for the player');
  return session;
}

/** A lesson foe's policy: the Easy AI. */
export function foePolicy(format: string): Policy {
  return aiFor({ difficulty: 'easy', style: 'balance', data: setsFor(format) });
}

/** The sim input for a lesson battle, with the player's policy supplied by the caller. */
export function battleInput(format: string, step: BattleStep, player: Policy): RunBattleInput {
  return {
    format,
    seed: deriveSeed(step.seed, 0),
    noLuck: step.noLuck,
    p1: { team: teamOf(format, step.player), policy: player, seed: deriveSeed(step.seed, 1) },
    p2: {
      team: teamOf(format, step.foe),
      policy: foePolicy(format),
      seed: deriveSeed(step.seed, 2),
    },
  };
}
