// The engine on the main thread, for tests (no worker).
import type { BattleBackend } from './backend';
import { BattleEngine } from './engine';

export function inlineBackend(): BattleBackend {
  let engine: BattleEngine | null = null;
  const need = () => {
    if (!engine) throw new Error('No battle in progress');
    return engine;
  };
  return {
    start: async (start) => {
      engine = new BattleEngine(start);
      return engine.begin();
    },
    choose: async (choice) => need().choose(choice),
    forfeit: async () => need().forfeit(),
  };
}
