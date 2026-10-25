import type { TeamSlot } from '@daily-battle/gen';

/** A tutorial Pokémon written out in full: neutral EVs (85 each) and no nature unless given. */
export interface CustomMon {
  species: string;
  moves: string[];
  ability?: string;
  item?: string;
}

/** A team member: a set from the game's set data, or a simple custom one. */
export type Mon = TeamSlot | CustomMon;

/**
 * One decision round: what each side does. Steps use names ("move Surf",
 * "switch Skarmory") or indices ("move 2"); a side with nothing to choose is
 * left out.
 */
export interface Round {
  p1?: string;
  p2?: string;
}

/** A battle position: two teams, a seed, and the rounds played to reach it. Always no-luck. */
export interface Position {
  p1: Mon[];
  p2: Mon[];
  /** Seed label (the battle seed is derived from it). */
  seed: string;
  rounds?: Round[];
}

export type Grade = 'best' | 'ok' | 'wrong';

export interface Answer {
  /** A step, as in `Round`. */
  choice: string;
  grade: Grade;
  /** One or two sentences: why it's good or bad here. */
  why: string;
}

export interface CardStep {
  kind: 'card';
  title: string;
  /** Short paragraphs. */
  text: string[];
  /** Species to show alongside the text. */
  sprites?: string[];
}

export interface QuizStep {
  kind: 'quiz';
  prompt: string;
  position: Position;
  /** Graded options; at least one is `best`. */
  answers: Answer[];
  /** Shown for any legal choice not in nswers (required when there is one). */
  otherwise?: string;
  /**
   * `damage`: the answers are attacks, and tests check that their grades
   * follow the damage they deal here (best ≥ ok ≥ wrong).
   */
  check?: 'damage';
}

export interface FoeScript {
  moves?: string[];
  switches?: string[];
}

export interface Prompt {
  /** Shown at the start of this turn (1-based). */
  turn: number;
  text: string;
}

export interface BattleStep {
  kind: 'battle';
  intro: string;
  player: Mon[];
  foe: Mon[];
  /** A scripted foe (falls back to the Easy AI when a step can't be played), or the Easy AI. */
  foeAi: FoeScript | 'easy';
  /** Seed label. */
  seed: string;
  /** Remove luck (no crits, misses, or secondary effects). */
  noLuck: boolean;
  prompts: Prompt[];
  /** Shown after the battle, win or lose. */
  takeaway: string;
  /**
   * The line the lesson teaches, for content tests: played by the player
   * against the scripted foe, it must win with no skipped steps.
   */
  intended?: FoeScript;
}

export type Step = CardStep | QuizStep | BattleStep;

export interface Lesson {
  /** Stable id, stored in progress (e.g. `gen3-basics`). */
  id: string;
  format: string;
  number: number;
  title: string;
  summary: string;
  steps: Step[];
}
