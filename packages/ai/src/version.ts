// Versions saved with each attempt, and the difficulty names. Kept free of the
// AI's code so the web app's main bundle can import it cheaply.
import { WASM_VERSION } from '@daily-battle/engine-wasm/version';

/**
 * Bump when the AI's choices could change for the same inputs. An in-progress
 * battle saved under another version can't be replayed faithfully, so it's
 * recorded as a forfeit instead of resumed (DESIGN.md §15).
 */
export const AI_VERSION = 1;

/** The same for Easy's preset and Hard's search (translation, worlds, budget); Normal ignores them. */
export const EASY_VERSION = 1;
export const HARD_VERSION = 1;

export const DIFFICULTIES = ['easy', 'normal', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const isDifficulty = (x: unknown): x is Difficulty =>
  typeof x === 'string' && (DIFFICULTIES as readonly string[]).includes(x);

/** What a difficulty adds to the AI version: nothing for Normal, so its saves keep resuming. */
export function difficultyTag(difficulty: Difficulty): string {
  if (difficulty === 'easy') return ` easy ${EASY_VERSION}`;
  if (difficulty === 'hard') return ` hard ${HARD_VERSION} e${WASM_VERSION}`;
  return '';
}

/** The AI part of an attempt's engine string: `ai 1`, `ai 1 easy 1`, `ai 1 hard 1 e1`. */
export const aiVersion = (difficulty: Difficulty): string =>
  `ai ${AI_VERSION}${difficultyTag(difficulty)}`;
