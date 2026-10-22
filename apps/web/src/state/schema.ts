// Client state, versioned (DESIGN.md §10). Bump `version` and add a migration
// in storage.ts for any breaking change.
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
  /** A practice run's one-off change; if the run is won, it carries over to the team. */
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
  swapUsed: boolean;
  change?: DayChange;
  /** Species chosen to lead today. */
  lead?: string;
  /**
   * Once today's counted tries are done, each practice run may make one change of
   * its own, kept here until the run starts. It doesn't touch the weekly team
   * unless that run is won.
   */
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
  battleSpeed: 'normal' | 'fast' | 'instant';
  animations: boolean;
  /** One-time explainers already shown; includes 'welcome' after first run. */
  shownExplainers: string[];
}

/** Streaks and stats are derived from `days` (lib/results.ts), not stored. */
export interface State {
  version: 2;
  weeks: Record<string, WeekState>;
  days: Record<string, DayState>;
  settings: Settings;
}

export function initialState(): State {
  return {
    version: 2,
    weeks: {},
    days: {},
    settings: { beginnerHints: true, battleSpeed: 'fast', animations: true, shownExplainers: [] },
  };
}

export const emptyDay = (): DayState => ({ swapUsed: false, attempts: [] });
