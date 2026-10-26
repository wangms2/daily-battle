// How the UI talks to a battle: by default a Web Worker running the engine.
// Tests swap in the engine directly on the main thread.
import { createContext, useContext } from 'react';
import type { CoachNote, Review } from '@daily-battle/tutorial';
import type { Position } from '@daily-battle/tutorial/lessons';
import type {
  EngineStart,
  FromWorker,
  PositionPackage,
  ToWorker,
  TurnPackage,
  TurnReplay,
} from './frames';

export interface BattleBackend {
  start(start: EngineStart): Promise<TurnPackage>;
  choose(choice: string): Promise<TurnPackage>;
  forfeit(): Promise<TurnPackage>;
  /**
   * Packages that arrive without a choice of yours: a live foe's turn, their
   * giving up, or your clock running out. Returns an unsubscribe.
   */
  subscribe?(onPackage: (pkg: TurnPackage) => void): () => void;
  /**
   * Coach on: its warning on a choice you picked, or null (DESIGN.md §22). The
   * judge gets up to `waitMs` to finish; if it hasn't, there's no warning.
   */
  coachCheck?(choice: string, waitMs: number): Promise<CoachNote | null>;
  /**
   * Coach on: tips that waited for the judge, as they're confirmed (after the
   * controls show). Returns an unsubscribe.
   */
  onCoachTip?(onTip: (note: CoachNote) => void): () => void;
  /**
   * After a battle played without the coach (Gen 3): the coach's review of it,
   * judged on request; `onProgress` follows the choices judged.
   */
  review?(onProgress: (done: number, total: number) => void): Promise<Review>;
  /** Coach review: one of your past decisions in this battle, replayed. */
  replay?(decision: number): Promise<TurnReplay | null>;
  /** A quiz position (Learn mode); separate from any battle in progress. */
  position?(format: string, position: Position, steps: string[]): Promise<PositionPackage>;
}

let shared: Worker | null = null;

/** Starts the worker (and its ~1 MB of simulator code) before it's needed. */
export function warmBattleWorker(): Worker {
  shared ??= new Worker(new URL('./battle.worker.ts', import.meta.url), { type: 'module' });
  return shared;
}

/** Sends messages one at a time and resolves each with the worker's answer. */
export function workerBackend(): BattleBackend {
  let queue: Promise<unknown> = Promise.resolve();
  const send = <T = TurnPackage>(msg: ToWorker) => {
    const next = queue.then(
      () =>
        new Promise<T>((resolve, reject) => {
          const worker = warmBattleWorker();
          const onMessage = (e: MessageEvent<FromWorker>) => {
            // Tips and progress come unasked: they aren't this message's answer.
            if (e.data.type === 'tip' || e.data.type === 'reviewProgress') return;
            worker.removeEventListener('message', onMessage);
            if (e.data.type === 'package') resolve(e.data.pkg as T);
            else if (e.data.type === 'position') resolve(e.data.position as T);
            else if (e.data.type === 'check') resolve(e.data.note as T);
            else if (e.data.type === 'replay') resolve(e.data.replay as T);
            else if (e.data.type === 'review') resolve(e.data.review as T);
            else if (e.data.type === 'error') reject(new Error(e.data.message));
          };
          worker.addEventListener('message', onMessage);
          worker.postMessage(msg);
        }),
    );
    queue = next.catch(() => {});
    return next;
  };
  return {
    start: (start) => send({ type: 'start', start }),
    choose: (choice) => send({ type: 'choose', choice }),
    forfeit: () => send({ type: 'forfeit' }),
    coachCheck: (choice, waitMs) => send<CoachNote | null>({ type: 'check', choice, waitMs }),
    replay: (decision) => send<TurnReplay | null>({ type: 'replay', decision }),
    review: (onProgress) => {
      const worker = warmBattleWorker();
      const onMessage = (e: MessageEvent<FromWorker>) => {
        if (e.data.type === 'reviewProgress') onProgress(e.data.done, e.data.total);
      };
      worker.addEventListener('message', onMessage);
      return send<Review>({ type: 'review' }).finally(() =>
        worker.removeEventListener('message', onMessage),
      );
    },
    onCoachTip: (onTip) => {
      const worker = warmBattleWorker();
      const onMessage = (e: MessageEvent<FromWorker>) => {
        if (e.data.type === 'tip') onTip(e.data.note);
      };
      worker.addEventListener('message', onMessage);
      return () => worker.removeEventListener('message', onMessage);
    },
    position: (format, position, steps) =>
      send<PositionPackage>({ type: 'position', format, position, steps }),
  };
}

export const BattleBackendContext = createContext<() => BattleBackend>(workerBackend);

export const useBattleBackend = () => useContext(BattleBackendContext);
