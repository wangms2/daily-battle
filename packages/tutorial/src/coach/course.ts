// Where the Gen 3 course teaches each idea the coach talks about (DESIGN.md
// §22, docs/plan-tutorial-coach.md step 4b). In a lesson the coach only
// speaks about ideas the player has learned by then: a tip or warning whose
// idea comes later stays quiet. Lesson numbers are the course's (1–18); null
// means the course doesn't teach it (the coach never uses it in lessons).
import type { NoEffect } from '@daily-battle/ai';
import type { WarningReason } from './explain';
import type { CoachRule } from './simple';

/** The lesson that teaches each warning reason. */
export const REASON_LESSON: Record<WarningReason, number | null> = {
  // 1 A turn: knockouts, and status moves that heal.
  missedKo: 1,
  fails: 1,
  // 3 Super effective and resisted.
  weaker: 3,
  // 4 Immune (other no-effect kinds: see `NO_EFFECT_LESSON`).
  noEffect: 4,
  // 10 Switch to take the hit.
  staysKo: 10,
  switchKo: 10,
  bigHit: 10,
  // 14 Spikes and Rapid Spin.
  noSpikes: 14,
  // 15 Setting up.
  noTime: 15,
  // Explosion isn't taught in this course.
  selfKo: null,
  explosion: null,
};

/** A move that does nothing, by why: types and Levitate in lesson 4, the rest with their topic. */
export const NO_EFFECT_LESSON: Record<NoEffect['kind'], number | null> = {
  type: 4,
  ability: 4,
  statused: 12,
  statusImmune: 12,
  sleepClause: 13,
  hazardMax: 14,
  substitute: null,
};

/** The lesson that teaches each tip's idea. */
export const TIP_LESSON: Record<CoachRule, number | null> = {
  canKo: 1,
  koThreat: 7,
  walled: 11,
  foeAsleep: 13,
  spikes: 14,
  setupWindow: 15,
  locked: 16,
};
