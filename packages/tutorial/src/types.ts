import type { TeamSlot } from '@daily-battle/gen';

/** A tutorial Pokémon written out in full: neutral EVs (85 each) and no nature unless given. */
export interface CustomMon {
  species: string;
  moves: string[];
  ability?: string;
  item?: string;
}

/**
 * A team member: a set from the game's set data (optionally with its moves
 * swapped, e.g. to leave out moves no lesson teaches), or a simple custom one.
 */
export type Mon = (TeamSlot & { moves?: string[] }) | CustomMon;

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
  /** Shown for any legal choice not in `answers` (required when there is one). */
  otherwise?: string;
  /**
   * How tests check the grades. `damage`: the answers are attacks, and their
   * grades follow the damage they deal here (best ≥ ok ≥ wrong). `outcome`:
   * each answer is played out against `foeAi` many times, and a better grade
   * never does worse (wins, then HP left).
   */
  check?: 'damage' | 'outcome';
  /** The foe for `outcome` checks (the Easy AI if left out). */
  foeAi?: FoeScript | 'easy';
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

export interface PickOption {
  mon: Mon;
  /** Its job on a team: "Spinner", "Special wall". */
  role: string;
  grade: Grade;
  /** Why it does or doesn't fit this team. */
  why: string;
}

/**
 * Guided picking with feedback on each choice. `team` (the default) adds
 * Pokémon from a pool to a team; `lead` picks one of your own team to lead
 * against the foe's six.
 */
export interface PickStep {
  kind: 'pick';
  target?: 'team' | 'lead';
  prompt: string;
  /** The team so far (empty for a lead pick). */
  team: Mon[];
  /** The foe's species, shown for context (as on the daily brief). */
  foe?: string[];
  options: PickOption[];
  /** How many to add. */
  picks: number;
  /** Shown once the picks are done. */
  done: string;
}

/**
 * A demo: one turn shown on the battle screen (docs/plan-tutorial-coach.md,
 * step 4b). The screen points at what matters, the coach card names the idea,
 * and the turn plays when the player taps Watch.
 */
export interface DemoStep {
  kind: 'demo';
  position: Position;
  /** The turn shown: what each side does (steps as in `Round`). */
  turn: Round;
  /** The coach card before the turn plays, and after it. One idea, plainly. */
  before: string;
  after: string;
  /**
   * Parts of the screen to point at, before the turn and after it: `foe-types`,
   * `foe-hp`, `foe-plate`, the same for `you`, `log` (the battle text), or a
   * choice as a step (`move Surf`).
   */
  spotlight?: { before?: string[]; after?: string[] };
}

export type Step = CardStep | QuizStep | BattleStep | PickStep | DemoStep;

export interface Lesson {
  /** Stable id, stored in progress (e.g. `gen3-basics`). */
  id: string;
  format: string;
  number: number;
  /** The final battle: shown with a cap instead of its number. */
  graduation?: boolean;
  /** Being redesigned (step 4b): opens by its link, but isn't listed or offered as next. */
  draft?: boolean;
  title: string;
  summary: string;
  steps: Step[];
}
