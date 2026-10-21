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
  battleSeed: string;
  aiSeed: string;
  choices: string[];
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
  attempts: Attempt[];
}

export interface WeekState {
  team: Slot[];
  /** Which published pool this team came from: `<week>:c<candidate>`. */
  poolId: string;
}

export interface Stats {
  daysPlayed: number;
  firstTryWins: number;
  firstTryStreak: number;
  bestFirstTryStreak: number;
  lastScoredDay: string | null;
  clears: number;
  totalAttempts: number;
}

export interface Settings {
  beginnerHints: boolean;
  battleSpeed: 'normal' | 'fast' | 'instant';
  animations: boolean;
  /** One-time explainers already shown; includes 'welcome' after first run. */
  shownExplainers: string[];
}

export interface State {
  version: 1;
  weeks: Record<string, WeekState>;
  days: Record<string, DayState>;
  stats: Stats;
  settings: Settings;
}

export function initialState(): State {
  return {
    version: 1,
    weeks: {},
    days: {},
    stats: {
      daysPlayed: 0,
      firstTryWins: 0,
      firstTryStreak: 0,
      bestFirstTryStreak: 0,
      lastScoredDay: null,
      clears: 0,
      totalAttempts: 0,
    },
    settings: { beginnerHints: true, battleSpeed: 'fast', animations: true, shownExplainers: [] },
  };
}

export const emptyDay = (): DayState => ({ swapUsed: false, attempts: [] });
