// Versions saved with each attempt, and the difficulty names. Kept free of the
// AI's code so the web app's main bundle can import it cheaply.
import { WASM_VERSION } from '@daily-battle/engine-wasm/version';

/**
 * Bump when the AI's choices could change for the same inputs. An in-progress
 * battle saved under another version can't be replayed faithfully, so it's
 * recorded as a forfeit instead of resumed (DESIGN.md §15), unless that version
 * is still playable (`RESUMABLE_AI`).
 *
 * 2: Easy and Normal stop swapping the same two Pokémon back and forth, and
 * take a KO that lands before the foe can move.
 */
export const AI_VERSION = 2;

/** Older AI versions Easy and Normal can still play, so their saved battles resume. */
export const RESUMABLE_AI: readonly number[] = [1];

/**
 * The same for Easy's preset and Hard's search (translation, worlds, budget); Normal ignores them.
 * Hard 2: near-ties are drawn (`variety`).
 */
export const EASY_VERSION = 1;
export const HARD_VERSION = 2;

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

/** The AI part of an attempt's engine string: `ai 2`, `ai 2 easy 1`, `ai 2 hard 2 e2`. */
export const aiVersion = (difficulty: Difficulty): string =>
  `ai ${AI_VERSION}${difficultyTag(difficulty)}`;

/** The AI version in a saved engine string (`sim … ai 2 easy 1` → 2); 1 if there's none. */
export function aiVersionOf(engine: string): number {
  const m = / ai (\d+)/.exec(engine);
  return m ? Number(m[1]) : 1;
}

/**
 * Whether a battle saved with `saved` can resume under `current` (both full
 * engine strings): the same, or the same but for an AI version still playable.
 */
export function canResume(saved: string, current: string): boolean {
  if (saved === current) return true;
  return RESUMABLE_AI.some((v) => saved === current.replace(/ ai \d+/, ` ai ${v}`));
}
