// CPU difficulty: Easy and Normal are utility presets; Hard is engine search;
// Master is the network with a light search.
import type { SetsFile } from '@daily-battle/data';
import type { Engine } from '@daily-battle/engine-wasm';
import type { Style } from '@daily-battle/gen';
import type { Policy } from '@daily-battle/sim-bridge';
import { HardPolicy, type HardPolicyOptions } from './hard/policy';
import { MASTER_DEFAULTS, NetPolicy } from './master/policy';
import { UtilityPolicy } from './policy';
import { EASY, legacy, PRESETS, type Params } from './presets';
import { AI_VERSION, HARD_ITERATIONS, type Difficulty } from './version';

export {
  aiVersion,
  coachNetJudge,
  DIFFICULTIES,
  difficultyTag,
  isDifficulty,
  searches,
  type Difficulty,
} from './version';

export interface AiForOptions {
  difficulty: Difficulty;
  /** The opponent team's style (Normal only). */
  style: Style;
  data?: SetsFile;
  /** Hard and Master: poke-engine for this format's gen (SIMD for Master). Without it they can't be built. */
  engine?: Engine;
  /** Master: the network (.dbnet bytes), unless `engine` has it loaded already. */
  net?: Uint8Array;
  /** Hard and Master: the week's public pool (prior for unseen foes). */
  pool?: readonly string[];
  /** Hard: override the search budget (tests, eval). */
  hard?: Pick<HardPolicyOptions, 'iterations' | 'worlds'>;
  /** Hard: the Hard version a saved battle started under; an older one keeps its budget. */
  hardVersion?: number;
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
        ...(options.hardVersion !== undefined && HARD_ITERATIONS[options.hardVersion]
          ? { iterations: HARD_ITERATIONS[options.hardVersion] }
          : {}),
        ...options.hard,
      });
    case 'master':
      if (!options.engine) throw new Error('Master difficulty needs the engine');
      return new NetPolicy({
        engine: options.engine,
        ...(options.net ? { net: options.net } : {}),
        ...data,
        ...(options.pool ? { pool: options.pool } : {}),
        ...MASTER_DEFAULTS,
      });
  }
}
