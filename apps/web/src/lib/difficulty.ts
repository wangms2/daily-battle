// Which CPU difficulty a game is played at (DESIGN.md §4.6).
import type { Difficulty } from '@daily-battle/ai/version';
import type { FormatId } from '@daily-battle/data/formats';
import { hardAvailable, masterAvailable } from '../battle/hardEngine';
import { attemptInProgress } from '../state/reducer';
import type { DayState, Settings } from '../state/schema';
import { attemptDifficulty } from './results';

export const DIFFICULTY_HINT: Record<Difficulty, string> = {
  easy: 'A gentle opponent for learning: it mostly attacks and rarely switches.',
  normal: 'Plays like a typical ladder player.',
  hard: 'Thinks turns ahead and guesses your sets. Takes a moment to choose.',
  master:
    'The strongest: a neural network trained by self-play reads the battle and searches ahead.',
};

/** Why a difficulty can't be picked here. */
export const UNAVAILABLE_HINT: Partial<Record<Difficulty, string>> = {
  master: 'Master needs a browser with WebAssembly SIMD.',
};

/** Difficulties this build or browser can't play for the format. */
export function unavailableDifficulties(format: FormatId): Difficulty[] {
  return [
    ...(hardAvailable(format) ? [] : ['hard' as const]),
    ...(masterAvailable(format) ? [] : ['master' as const]),
  ];
}

/** The difficulty picked for a game (Hard and Master only where they can play). */
export function pickedDifficulty(settings: Settings, format: FormatId): Difficulty {
  const d = settings.difficulty?.[format] ?? 'normal';
  return unavailableDifficulties(format).includes(d) ? 'normal' : d;
}

/** The difficulty in play today: an unfinished battle's, or else the one picked. */
export function currentDifficulty(
  settings: Settings,
  format: FormatId,
  day: DayState | undefined,
): Difficulty {
  const a = attemptInProgress(day);
  return a ? attemptDifficulty(a) : pickedDifficulty(settings, format);
}
