/// <reference lib="webworker" />
// Runs the simulator and the opponent AI off the main thread (DESIGN.md §7).
import { BattleEngine } from './engine';
import type { FromWorker, ToWorker } from './frames';

let engine: BattleEngine | null = null;

const post = (msg: FromWorker) => (self as DedicatedWorkerGlobalScope).postMessage(msg);

self.onmessage = (event: MessageEvent<ToWorker>) => {
  const msg = event.data;
  try {
    if (msg.type === 'start') {
      engine = new BattleEngine(msg.start);
      post({ type: 'package', pkg: engine.begin() });
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
