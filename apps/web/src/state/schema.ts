// Client state, versioned (DESIGN.md §10). Bump `version` and add a migration
// in storage.ts for any breaking change.
// Optional fields (like difficulties) are added without a bump: old saves just lack them.
import type { Difficulty } from '@daily-battle/ai/version';
import { FORMATS, type FormatId } from '@daily-battle/data/formats';
import type { CoachMemo } from '../battle/frames';
import type { Slot } from '../lib/data';

export type { Slot };

export interface Attempt {
  result: 'win' | 'loss' | 'forfeit' | 'inProgress';
  /** Player Pokémon remaining at the end. */
  remaining: number;
  ts: number;
  lead: string;
  /** The team as sent into battle, lead first (so resume uses the same team). */
  team: Slot[];
  battleSeed: string;
  aiSeed: string;
  /** Your choices so far; with the seeds, enough to replay the battle (§7). */
  choices: string[];
  /** Simulator and AI versions; a mismatch on resume records a forfeit (§15). */
  engine: string;
  /** Easy or Hard; absent for Normal (and for every attempt saved before difficulties). */
  difficulty?: 'easy' | 'hard';
  /**
   * The coach was on (DESIGN.md §22): set when the battle starts with it, or the
   * moment it's turned on mid-battle, and never unset. A Coached result.
   */
  coached?: true;
  /**
   * Hard only: the AI's choices so far. A resume replays them instead of searching
   * again; with the seeds they reproduce the same battle.
   */
  aiChoices?: string[];
  /**
   * Coach on: the coach's memo per choice (null where there's none), by index
   * in `choices`: the judge's verdict and any warning you overrode, so a resume
   * neither judges again nor asks again (DESIGN.md §22).
   */
  coachLog?: (CoachMemo | null)[];
  /** Saves before practice teams: a practice run's one-off change. No longer written or used. */
  practiceChange?: DayChange;
}

/** Today's single change (§4.2); it carries over for the rest of the week. */
export interface DayChange {
  kind: 'replace' | 'set';
  /** Team slot index, 0–5. */
  slot: number;
  from: Slot;
  to: Slot;
}

export interface DayState {
  /** Today's one change (before the first try) is used. Free swaps after a loss don't count. */
  swapUsed: boolean;
  /** The player ditched their team today: the streak is over, whatever today's tries say. */
  ditched?: boolean;
  change?: DayChange;
  /** The difficulty today's change was made on (the team is shared, so it's used for all). */
  changeOn?: Difficulty;
  /** Species chosen to lead today. */
  lead?: string;
  /**
   * Once the difficulty being played is cleared for today, its runs are practice
   * and may use this team instead: built or changed freely, today only. It never
   * touches the weekly team.
   */
  practiceTeam?: Slot[];
  /** Saves before practice teams: a change for the next practice run. No longer used. */
  practiceChange?: DayChange;
  attempts: Attempt[];
}

export interface WeekState {
  team: Slot[];
  /** Which published pool this team came from: `<week>:c<candidate>`. */
  poolId: string;
}

export interface Settings {
  beginnerHints: boolean;
  /** 'instant' is for automated tests only; the UI offers slow, normal, and fast. */
  battleSpeed: 'slow' | 'normal' | 'fast' | 'instant';
  animations: boolean;
  /** Battle music and Pokémon cries (DESIGN.md §21); on for new players, at a gentle volume. */
  sound: boolean;
  /** 0 to 1, each with its own slider. */
  musicVolume: number;
  effectsVolume: number;
  /** One-time explainers already shown; includes 'welcome' after first run. */
  shownExplainers: string[];
  /** The game to show (Gen 4 OU or Gen 5 OU); unset until the player picks one. */
  format?: FormatId;
  /** The CPU difficulty picked for each game; Normal when unset. */
  difficulty?: Partial<Record<FormatId, Difficulty>>;
  /** Learn mode progress, per game that has lessons (Gen 3 so far). */
  tutorial?: Partial<Record<FormatId, TutorialProgress>>;
  /** The coach is on for a game's next battles (where it's offered: lib/coach.ts). */
  coach?: Partial<Record<FormatId, boolean>>;
  /** The coach was offered for a game (first daily, or after graduation), so it isn't again. */
  coachOffered?: Partial<Record<FormatId, boolean>>;
  /** The type trainer's boxes per game: each matchup answered, by key (lib/typeTrainer.ts). */
  typeTrainer?: Partial<Record<FormatId, Record<string, number>>>;
  /** The player's name, asked on their first Play; versus uses it too. */
  name?: string;
}

export interface TutorialProgress {
  /** Lesson ids finished (in the order they were finished). */
  completed: string[];
  /**
   * The lesson last opened and the step it's on, to resume, and the furthest
   * step reached in it (the slide arrows go forward up to it; `step` if absent).
   */
  current?: { lesson: string; step: number; reached?: number };
}

/**
 * One format's game: its weekly teams and daily tries. Streaks and stats are
 * derived from `days` (lib/results.ts), not stored.
 */
export interface GameState {
  weeks: Record<string, WeekState>;
  days: Record<string, DayState>;
}

/** v4: a game per format (Gen 4 OU, Gen 5 OU), sharing one set of settings. */
export interface State {
  version: 4;
  games: Record<FormatId, GameState>;
  settings: Settings;
}

export const emptyGame = (): GameState => ({ weeks: {}, days: {} });

export function initialState(): State {
  return {
    version: 4,
    games: Object.fromEntries(Object.keys(FORMATS).map((f) => [f, emptyGame()])) as Record<
      FormatId,
      GameState
    >,
    settings: {
      beginnerHints: true,
      battleSpeed: 'normal',
      animations: true,
      sound: true,
      musicVolume: 0.35,
      effectsVolume: 0.4,
      shownExplainers: [],
    },
  };
}

export const emptyDay = (): DayState => ({ swapUsed: false, attempts: [] });
