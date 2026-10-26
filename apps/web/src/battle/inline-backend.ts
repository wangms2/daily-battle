// The engine on the main thread, for tests (no worker). Hard needs `hardEngine`
// to supply poke-engine for the format (tests load it from disk).
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
      const hard = start.difficulty === 'hard' ? hardEngine?.(start.format ?? 'gen4ou') : undefined;
      engine = new BattleEngine(start, hard);
      return engine.begin();
    },
    choose: async (choice) => need().choose(choice),
    forfeit: async () => need().forfeit(),
    position: async (format, position, steps) => presentPosition(format, position, steps),
  };
}
