/// <reference lib="webworker" />
// Runs the simulator and the opponent AI off the main thread (DESIGN.md §7).
import { BattleEngine, presentPosition } from './engine';
import type { FromWorker, ToWorker } from './frames';
import { loadHardEngine } from './hardEngine';

let engine: BattleEngine | null = null;

const post = (msg: FromWorker) => (self as DedicatedWorkerGlobalScope).postMessage(msg);

/** How long one slice of the coach's judging runs before letting messages in. */
const SLICE_MS = 30;
let working: ReturnType<typeof setTimeout> | null = null;

/**
 * The coach's judge works between messages, a slice at a time, while the turn
 * plays back and you choose (DESIGN.md §22).
 */
function work() {
  if (working) clearTimeout(working);
  working = setTimeout(() => {
    working = null;
    if (engine?.coachWork(SLICE_MS)) work();
  }, 0);
}

// The UI sends one message at a time and waits for its answer, so an awaited
// start can't interleave with a choice.
self.onmessage = async (event: MessageEvent<ToWorker>) => {
  const msg = event.data;
  try {
    if (msg.type === 'start') {
      const { start } = msg;
      const format = start.format ?? 'gen4ou';
      const hard = start.difficulty === 'hard' ? await loadHardEngine(format) : undefined;
      // Without the engine the coach still gives tips, but no warnings.
      const judge = start.coach ? await loadHardEngine(format).catch(() => undefined) : undefined;
      engine = new BattleEngine(start, hard, undefined, judge);
      post({ type: 'package', pkg: engine.begin() });
    } else if (msg.type === 'position') {
      post({ type: 'position', position: presentPosition(msg.format, msg.position, msg.steps) });
    } else if (!engine) {
      throw new Error('No battle in progress');
    } else if (msg.type === 'choose') {
      post({ type: 'package', pkg: engine.choose(msg.choice) });
    } else if (msg.type === 'check') {
      post({ type: 'check', note: engine.coachCheck(msg.choice, msg.waitMs) });
    } else {
      post({ type: 'package', pkg: engine.forfeit() });
    }
  } catch (e) {
    post({ type: 'error', message: e instanceof Error ? e.message : String(e) });
  }
  work();
};
