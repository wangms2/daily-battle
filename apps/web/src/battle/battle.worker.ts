/// <reference lib="webworker" />
// Runs the simulator and the opponent AI off the main thread (DESIGN.md §7).
import { BattleEngine, presentPosition, presentTurn } from './engine';
import type { Review } from '@daily-battle/tutorial';
import type { FromWorker, ToWorker } from './frames';
import { loadHardEngine } from './hardEngine';

let engine: BattleEngine | null = null;

const post = (msg: FromWorker) => (self as DedicatedWorkerGlobalScope).postMessage(msg);

/** How long one slice of the coach's judging runs before letting messages in. */
const SLICE_MS = 30;
/** A review's slices: longer, as nothing else is going on after the battle. */
const REVIEW_SLICE_MS = 100;
let working: ReturnType<typeof setTimeout> | null = null;

/**
 * The coach's judge works between messages, a slice at a time, while the turn
 * plays back and you choose (DESIGN.md §22).
 */
function work() {
  if (working) clearTimeout(working);
  working = setTimeout(() => {
    working = null;
    const more = engine?.coachWork(SLICE_MS);
    const tip = engine?.coachTip();
    if (tip) post({ type: 'tip', note: tip });
    if (more) work();
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
      // Without the engine the coach still gives fact tips, but no warnings.
      const judge = start.coach ? await loadHardEngine(format).catch(() => undefined) : undefined;
      engine = new BattleEngine(start, hard, undefined, judge);
      post({ type: 'package', pkg: engine.begin() });
    } else if (msg.type === 'turn') {
      post({ type: 'turn', turn: presentTurn(msg.format, msg.position, msg.turn, msg.spots) });
    } else if (msg.type === 'position') {
      post({ type: 'position', position: presentPosition(msg.format, msg.position, msg.steps) });
    } else if (!engine) {
      throw new Error('No battle in progress');
    } else if (msg.type === 'choose') {
      post({ type: 'package', pkg: engine.choose(msg.choice) });
    } else if (msg.type === 'review') {
      // Judged a slice at a time, so other messages (a replayed turn) get in between.
      const job = engine.reviewJob(await loadHardEngine(engine.start.format ?? 'gen4ou'));
      const review = await new Promise<Review>((resolve) => {
        const slice = () => {
          const done = job.step(REVIEW_SLICE_MS);
          post({ type: 'reviewProgress', done: job.done, total: job.total });
          if (done) resolve(done);
          else setTimeout(slice, 0);
        };
        slice();
      });
      post({ type: 'review', review });
    } else if (msg.type === 'replay') {
      post({ type: 'replay', replay: engine.replayTurn(msg.decision) });
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
