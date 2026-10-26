// The engine on the main thread, for tests (no worker). Hard and the coach's
// judge need `hardEngine` to supply poke-engine for the format (tests load it
// from disk); without it, a coached battle gives no warnings.
import type { Engine } from '@daily-battle/engine-wasm';
import type { BattleBackend } from './backend';
import { BattleEngine, presentPosition } from './engine';

export function inlineBackend(hardEngine?: (format: string) => Engine): BattleBackend {
  let engine: BattleEngine | null = null;
  const need = () => {
    if (!engine) throw new Error('No battle in progress');
    return engine;
  };
  return {
    start: async (start) => {
      const format = start.format ?? 'gen4ou';
      const hard = start.difficulty === 'hard' ? hardEngine?.(format) : undefined;
      const judge = start.coach ? hardEngine?.(format) : undefined;
      engine = new BattleEngine(start, hard, undefined, judge);
      return engine.begin();
    },
    choose: async (choice) => need().choose(choice),
    forfeit: async () => need().forfeit(),
    coachCheck: async (choice, waitMs) => need().coachCheck(choice, waitMs),
    position: async (format, position, steps) => presentPosition(format, position, steps),
  };
}
