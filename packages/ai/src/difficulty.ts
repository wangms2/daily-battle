// CPU difficulty: Easy and Normal are utility presets; Hard is engine search.
import type { SetsFile } from '@daily-battle/data';
import type { Engine } from '@daily-battle/engine-wasm';
import type { Style } from '@daily-battle/gen';
import type { Policy } from '@daily-battle/sim-bridge';
import { HardPolicy, type HardPolicyOptions } from './hard/policy';
import { UtilityPolicy } from './policy';
import { EASY, legacy, PRESETS, type Params } from './presets';
import { AI_VERSION, type Difficulty } from './version';

export { aiVersion, DIFFICULTIES, difficultyTag, isDifficulty, type Difficulty } from './version';

export interface AiForOptions {
  difficulty: Difficulty;
  /** The opponent team's style (Normal only). */
  style: Style;
  data?: SetsFile;
  /** Hard: poke-engine for this format's gen. Without it Hard can't be built. */
  engine?: Engine;
  /** Hard: the week's public pool (prior for unseen foes). */
  pool?: readonly string[];
  /** Hard: override the search budget (tests, eval). */
  hard?: Pick<HardPolicyOptions, 'iterations' | 'worlds'>;
  /**
   * Easy and Normal: the AI version a saved battle started under. An older
   * one plays as it did then, so the battle resumes exactly (DESIGN.md §15).
   */
  aiVersion?: number;
}

/** The opponent AI for a difficulty. Normal is exactly `aiForStyle` (at the current version). */
export function aiFor(options: AiForOptions): Policy {
  const data = options.data ? { data: options.data } : {};
  const at = (params: Params) => ((options.aiVersion ?? AI_VERSION) < 2 ? legacy(params) : params);
  switch (options.difficulty) {
    case 'easy':
      return new UtilityPolicy(at(EASY), data);
    case 'normal':
      return new UtilityPolicy(at(PRESETS[options.style]), data);
    case 'hard':
      if (!options.engine) throw new Error('Hard difficulty needs the engine');
      return new HardPolicy({
        engine: options.engine,
        ...data,
        ...(options.pool ? { pool: options.pool } : {}),
        ...options.hard,
      });
  }
}
