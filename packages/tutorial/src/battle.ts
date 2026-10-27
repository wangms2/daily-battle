import { aiFor } from '@daily-battle/ai';
import { setsFor } from '@daily-battle/data';
import {
  BattleSession,
  deriveSeed,
  makeRng,
  resolveStep,
  SIDES,
  type BattleResult,
  type Policy,
  type SideView,
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
  setStartHp(session, position.hp);
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

/** Sets starting HP (% of max) by team slot, silently. */
export function setStartHp(session: BattleSession, hp: Position['hp']) {
  for (const side of SIDES)
    for (const [slot, pct] of (hp?.[side] ?? []).entries())
      if (pct !== null) session.setHp(side, slot, pct / 100);
}

/**
 * A lesson battle's session at its start, as the app starts it: seeds from the
 * seed label (the step's, or a variant's), and the step's starting HP.
 */
export function battleSession(format: string, step: BattleStep, seed = step.seed): BattleSession {
  const session = new BattleSession({
    format,
    seed: deriveSeed(seed, 0),
    noLuck: step.noLuck,
    p1: { team: teamOf(format, step.player), name: 'You' },
    p2: { team: teamOf(format, step.foe), name: 'The opponent' },
  });
  setStartHp(session, step.hp);
  return session;
}

/**
 * Plays a lesson battle to the end against its foe (the Easy AI, seeded as in
 * the app), with `player` choosing for you. It's handed the session too, for
 * how many choices you've made.
 */
export function playBattle(
  format: string,
  step: BattleStep,
  player: (view: SideView, session: BattleSession) => string,
  seed = step.seed,
): BattleResult {
  const session = battleSession(format, step, seed);
  const foe = foePolicy(format);
  const rng = makeRng(deriveSeed(seed, 2));
  for (let guard = 0; !session.ended && guard < 1000; guard++)
    for (const side of SIDES) {
      const view = session.view(side);
      if (!view) continue;
      session.choose(side, side === 'p1' ? player(view, session) : foe.choose(view, rng));
      if (session.ended) break;
    }
  return session.result();
}

/** A lesson foe's policy: the Easy AI. */
export function foePolicy(format: string): Policy {
  return aiFor({ difficulty: 'easy', style: 'balance', data: setsFor(format) });
}
