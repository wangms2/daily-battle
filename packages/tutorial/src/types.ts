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
  /**
   * Starting HP (% of max) by team slot, set silently at the start: a position
   * part-way through a fight without turns in the log to get there.
   */
  hp?: { p1?: (number | null)[]; p2?: (number | null)[] };
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

/** A short battle against the Easy AI, with the coach's tips (only about what's been taught). */
export interface BattleStep {
  kind: 'battle';
  intro: string;
  player: Mon[];
  foe: Mon[];
  /** Seed label. */
  seed: string;
  /** Remove luck (no crits, misses, or secondary effects). */
  noLuck: boolean;
  /** Shown after the battle, win or lose. */
  takeaway: string;
}

/**
 * A demo: one turn shown on the battle screen (docs/plan-tutorial-coach.md,
 * step 4b). The screen points at what matters, the coach card names the idea,
 * and the turn plays when the player taps Watch.
 */
export interface DemoStep {
  kind: 'demo';
  position: Position;
  /**
   * The turn shown: what each side does (steps as in `Round`). Left out, the
   * step is a look: the screen stays at the position (often with a card open)
   * and Next comes at once.
   */
  turn?: Round;
  /** The coach card before the turn plays, and after it. One idea, plainly. */
  before: string;
  after?: string;
  /**
   * Open details, as if tapped: `foe` (the foe's card: spot `foe-ability`,
   * `foe-stats` or `foe-speed`), a move (`move Surf`: its details, spot
   * `move-details`) or a teammate (`switch Celebi`: its card, spot `team-card`).
   */
  card?: string;
  /**
   * The foe's set is unknown, as in a real battle: its card shows what its
   * real competitive sets could be (a Speed range), not its lesson set.
   */
  realSets?: boolean;
  /** Show the foe's move too (normally the demo stops once your move lands). */
  whole?: boolean;
  /**
   * Parts of the screen to point at, before the turn and after it: `foe-types`,
   * `foe-hp`, `foe-plate`, the same for `you`, `log` (the battle text), or a
   * choice as a step (`move Surf`).
   */
  spotlight?: { before?: string[]; after?: string[] };
}

/**
 * Practice (docs/plan-tutorial-coach.md, step 4b): the player picks on the
 * battle screen, the turn plays with their pick, and if it wasn't best, the
 * better choice can be replayed. Every choice that decides it should turn on
 * this lesson's idea or earlier ones.
 */
export interface PracticeStep {
  kind: 'practice';
  /** The question, one line. */
  prompt: string;
  position: Position;
  /** What the foe does this turn, whatever the player picks (a step). */
  foe: string;
  /** Graded choices; exactly one is `best`. */
  answers: Answer[];
  /** For any other choice. */
  otherwise: string;
  /** Parts of the screen to point at while the player chooses (as in `DemoStep`). */
  spotlight?: string[];
}

export type Step = DemoStep | PracticeStep | BattleStep;

export interface Lesson {
  /** Stable id, stored in progress (e.g. `gen3-turn`). */
  id: string;
  format: string;
  number: number;
  /** The final battle: shown with a cap instead of its number. */
  graduation?: boolean;
  /**
   * A unit review: practice positions only, mixing the unit's ideas with
   * earlier ones. Its `number` is the last lesson it covers (the coach's scope).
   */
  review?: boolean;
  title: string;
  summary: string;
  steps: Step[];
}
