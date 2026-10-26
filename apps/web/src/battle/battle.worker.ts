/// <reference lib="webworker" />
// Runs the simulator and the opponent AI off the main thread (DESIGN.md §7).
import { BattleEngine, presentPosition } from './engine';
import type { FromWorker, ToWorker } from './frames';
import { loadHardEngine } from './hardEngine';

let engine: BattleEngine | null = null;

const post = (msg: FromWorker) => (self as DedicatedWorkerGlobalScope).postMessage(msg);

// The UI sends one message at a time and waits for its answer, so an awaited
// start can't interleave with a choice.
self.onmessage = async (event: MessageEvent<ToWorker>) => {
  const msg = event.data;
  try {
    if (msg.type === 'start') {
      const { start } = msg;
      const hard =
        start.difficulty === 'hard' ? await loadHardEngine(start.format ?? 'gen4ou') : undefined;
      engine = new BattleEngine(start, hard);
      post({ type: 'package', pkg: engine.begin() });
    } else if (msg.type === 'position') {
      post({ type: 'position', position: presentPosition(msg.format, msg.position, msg.steps) });
    } else if (!engine) {
      throw new Error('No battle in progress');
    } else if (msg.type === 'choose') {
      post({ type: 'package', pkg: engine.choose(msg.choice) });
    } else {
      post({ type: 'package', pkg: engine.forfeit() });
    }
  } catch (e) {
    post({ type: 'error', message: e instanceof Error ? e.message : String(e) });
  }
};
