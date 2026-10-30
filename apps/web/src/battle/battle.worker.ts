/// <reference lib="webworker" />
// Runs the simulator and the opponent AI off the main thread (DESIGN.md §7).
import { BattleEngine, presentTurn } from './engine';
import type { Review } from '@daily-battle/tutorial';
import type { WorldClaim } from '@daily-battle/ai';
import { Engine, type WasmModule } from '@daily-battle/engine-wasm';
import { genOf } from '@daily-battle/data/formats';
import type { FromWorker, ToWorker } from './frames';
import { loadHardEngine, loadHardModule } from './hardEngine';
import type { FromHelper, ToHelper } from './search.worker';

let engine: BattleEngine | null = null;

const post = (msg: FromWorker) => (self as DedicatedWorkerGlobalScope).postMessage(msg);

/**
 * Helpers that search some of Hard's worlds on other cores, so a decision is
 * ready sooner when you tap straight through. One core is left for the page
 * and one for this worker; a helper that fails is dropped, and its world is
 * searched here. The worlds and their seeds are the same, so is the choice.
 */
const HELPERS = Math.min(3, Math.max(0, (self.navigator?.hardwareConcurrency || 2) - 2));
interface Helper {
  worker: Worker;
  loaded: Set<number>;
  claim?: WorldClaim;
}
let helpers: Helper[] = [];
/** Hard's module for this battle, for the helpers. */
let hardModule: { gen: number; module: WasmModule } | undefined;
/** Waiting for a helper to answer. */
const answered: (() => void)[] = [];

function startHelpers() {
  if (helpers.length || typeof Worker === 'undefined') return;
  for (let i = 0; i < HELPERS; i++) {
    try {
      const helper: Helper = {
        worker: new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' }),
        loaded: new Set(),
      };
      helper.worker.onmessage = (e: MessageEvent<FromHelper>) => {
        const claim = helper.claim;
        helper.claim = undefined;
        if ('result' in e.data) claim?.give(e.data.result);
        else dropHelper(helper);
        helperDone();
      };
      helper.worker.onerror = () => {
        dropHelper(helper);
        helperDone();
      };
      helpers.push(helper);
    } catch {
      break;
    }
  }
}

function dropHelper(helper: Helper) {
  helper.worker.terminate();
  helpers = helpers.filter((h) => h !== helper);
}

function helperDone() {
  answered.splice(0).forEach((resume) => resume());
  work();
}

/** Hands the opponent's unsearched worlds to idle helpers. */
function feedHelpers() {
  if (hidden || !engine || !hardModule) return;
  const { gen, module } = hardModule;
  for (const helper of helpers) {
    if (helper.claim) continue;
    const claim = engine.claimWorld();
    if (!claim) return;
    const send = (msg: ToHelper) => helper.worker.postMessage(msg);
    if (!helper.loaded.has(gen)) {
      send({ type: 'load', gen, module });
      helper.loaded.add(gen);
    }
    helper.claim = claim;
    const { state, iterations, seed } = claim.world;
    send({ type: 'search', gen, state, iterations, seed });
  }
}

/** Hard: finishes the opponent's decision, with the helpers, before your choice goes in. */
async function thinkThrough() {
  for (;;) {
    feedHelpers();
    if (engine?.ponder()) {
      // Lets the helpers' answers in between worlds.
      await new Promise((resolve) => setTimeout(resolve, 0));
      continue;
    }
    if (!helpers.some((h) => h.claim)) return;
    await new Promise<void>((resolve) => answered.push(resolve));
  }
}

/** How long one slice of the coach's judging runs before letting messages in. */
const SLICE_MS = 30;
/** A review's slices: longer, as nothing else is going on after the battle. */
const REVIEW_SLICE_MS = 100;
let working: ReturnType<typeof setTimeout> | null = null;
/** The page is hidden: no background work until it's back. */
let hidden = false;
/** Work waiting for the page to be visible again. */
const waiting: (() => void)[] = [];

/**
 * Background work, a slice at a time between messages (DESIGN.md §7): the
 * coach's judge (§22), and Hard's search for the opponent's decision, from the
 * moment a turn is sent, so it's usually done before you choose, even when you
 * tap straight through. Off the main thread, so animations don't wait on it.
 * Paused while the page is hidden.
 */
function work() {
  if (working) clearTimeout(working);
  working = null;
  if (hidden) return;
  working = setTimeout(() => {
    working = null;
    if (hidden) return;
    const more = engine?.coachWork(SLICE_MS);
    const tip = engine?.coachTip();
    if (tip) post({ type: 'tip', note: tip });
    feedHelpers();
    const thinking = engine?.ponder();
    if (more || thinking) work();
  }, 0);
}

// The UI sends one message at a time and waits for its answer, so an awaited
// start can't interleave with a choice. Hints (`warm`, `visibility`) aren't
// answered and can come at any time.
self.onmessage = async (event: MessageEvent<ToWorker>) => {
  const msg = event.data;
  try {
    if (msg.type === 'warm') {
      void loadHardEngine(msg.format).catch(() => {});
    } else if (msg.type === 'visibility') {
      hidden = msg.hidden;
      if (!hidden) waiting.splice(0).forEach((resume) => resume());
    } else if (msg.type === 'start') {
      const { start } = msg;
      engine = null;
      hardModule = undefined;
      const format = start.format ?? 'gen4ou';
      let hard: Engine | undefined;
      if (start.difficulty === 'hard') {
        const module = await loadHardModule(format);
        hard = new Engine(module);
        hardModule = { gen: genOf(format), module };
        startHelpers();
      }
      // Without the engine the coach still gives fact tips, but no warnings.
      const judge = start.coach ? await loadHardEngine(format).catch(() => undefined) : undefined;
      engine = new BattleEngine(start, hard, undefined, judge);
      post({ type: 'package', pkg: engine.begin() });
    } else if (msg.type === 'turn') {
      post({
        type: 'turn',
        turn: presentTurn(msg.format, msg.position, msg.turn, msg.spots, msg.whole),
      });
    } else if (!engine) {
      throw new Error('No battle in progress');
    } else if (msg.type === 'choose') {
      await thinkThrough();
      post({ type: 'package', pkg: engine.choose(msg.choice) });
    } else if (msg.type === 'review') {
      // Judged a slice at a time, so other messages (a replayed turn) get in between.
      const job = engine.reviewJob(await loadHardEngine(engine.start.format ?? 'gen4ou'));
      const review = await new Promise<Review>((resolve) => {
        const slice = () => {
          if (hidden) return waiting.push(slice);
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
