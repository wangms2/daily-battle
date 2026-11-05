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
 * Hard 2: near-ties are drawn (`variety`). Hard 3: 100k iterations a decision (was 150k).
 * Master: its network and search settings (master/policy.ts `MASTER_DEFAULTS`).
 */
export const EASY_VERSION = 1;
export const HARD_VERSION = 3;
export const MASTER_VERSION = 1;

/** Hard's search budget (iterations a decision) by version: older saved battles resume with theirs. */
export const HARD_ITERATIONS: Readonly<Record<number, number>> = { 2: 150_000, 3: 100_000 };

/** Master's network: served at `/net/{MASTER_NET}.dbnet` (apps/web/public), never changed in place. */
export const MASTER_NET = 'master-15447166';
export const MASTER_NET_PATH = `/net/${MASTER_NET}.dbnet`;

/** Older Hard versions that can still play, so their saved battles resume. */
export const RESUMABLE_HARD: readonly number[] = [2];

export const DIFFICULTIES = ['easy', 'normal', 'hard', 'master'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const isDifficulty = (x: unknown): x is Difficulty =>
  typeof x === 'string' && (DIFFICULTIES as readonly string[]).includes(x);

/** Difficulties that run poke-engine (and save their choices, as a resume would otherwise redo every search). */
export const searches = (d: Difficulty | undefined): d is 'hard' | 'master' =>
  d === 'hard' || d === 'master';

/**
 * Whether the coach's judge is Master's network (DESIGN.md §22): against Normal
 * and Hard. Against Easy the search judge's warnings measured better (coach-eval).
 * No difficulty is Normal, as in a battle's start.
 */
export const coachNetJudge = (d: Difficulty | undefined): boolean =>
  d === undefined || d === 'normal' || d === 'hard';

/** What a difficulty adds to the AI version: nothing for Normal, so its saves keep resuming. */
export function difficultyTag(difficulty: Difficulty): string {
  if (difficulty === 'easy') return ` easy ${EASY_VERSION}`;
  if (difficulty === 'hard') return ` hard ${HARD_VERSION} e${WASM_VERSION}`;
  if (difficulty === 'master') return ` master ${MASTER_VERSION} e${WASM_VERSION}`;
  return '';
}

/** The AI part of an attempt's engine string: `ai 2`, `ai 2 easy 1`, `ai 2 hard 3 e2`, `ai 2 master 1 e2`. */
export const aiVersion = (difficulty: Difficulty): string =>
  `ai ${AI_VERSION}${difficultyTag(difficulty)}`;

/** The AI version in a saved engine string (`sim … ai 2 easy 1` → 2); 1 if there's none. */
export function aiVersionOf(engine: string): number {
  const m = / ai (\d+)/.exec(engine);
  return m ? Number(m[1]) : 1;
}

/** The Hard version in a saved engine string (`… ai 2 hard 2 e2` → 2); undefined if it isn't Hard. */
export function hardVersionOf(engine: string): number | undefined {
  const m = / hard (\d+)/.exec(engine);
  return m ? Number(m[1]) : undefined;
}

/**
 * Whether a battle saved with `saved` can resume under `current` (both full
 * engine strings): the same, or the same but for an AI or Hard version still playable.
 */
export function canResume(saved: string, current: string): boolean {
  if (saved === current) return true;
  const ais = [AI_VERSION, ...RESUMABLE_AI];
  const hards = [HARD_VERSION, ...RESUMABLE_HARD];
  return ais.some((a) =>
    hards.some(
      (h) => saved === current.replace(/ ai \d+/, ` ai ${a}`).replace(/ hard \d+/, ` hard ${h}`),
    ),
  );
}
