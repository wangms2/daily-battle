// The engine on the main thread, for tests (no worker). Hard needs `hardEngine`
// to supply poke-engine for the format (tests load it from disk), Master
// `masterEngine` (with its network loaded). The coach's judge uses Master's
// engine when given (not in lessons), else Hard's; without either, a coached
// battle gives no warnings.
import type { Engine } from '@daily-battle/engine-wasm';
import type { CoachNote } from '@daily-battle/tutorial';
import type { BattleBackend } from './backend';
import { BattleEngine, presentTurn } from './engine';

export function inlineBackend(
  hardEngine?: (format: string) => Engine,
  masterEngine?: (format: string) => Engine,
): BattleBackend {
  let engine: BattleEngine | null = null;
  const need = () => {
    if (!engine) throw new Error('No battle in progress');
    return engine;
  };
  const tipListeners = new Set<(note: CoachNote) => void>();
  /** Like the worker: the judge works after an answer, and a waiting tip is sent once it's ready. */
  const later = <T>(answer: T): T => {
    setTimeout(() => {
      const e = engine;
      if (!e) return;
      let tip = e.coachTip();
      while (!tip && e.coachWork(1000)) tip = e.coachTip();
      if (tip) for (const l of tipListeners) l(tip);
    }, 0);
    return answer;
  };
  return {
    start: async (start) => {
      const format = start.format ?? 'gen4ou';
      const hard =
        start.difficulty === 'hard'
          ? hardEngine?.(format)
          : start.difficulty === 'master'
            ? masterEngine?.(format)
            : undefined;
      const judge = !start.coach
        ? undefined
        : (!start.tutorial && masterEngine?.(format)) || hardEngine?.(format);
      engine = new BattleEngine(start, hard, undefined, judge);
      return later(engine.begin());
    },
    choose: async (choice) => later(need().choose(choice)),
    forfeit: async () => need().forfeit(),
    coachCheck: async (choice, waitMs) => need().coachCheck(choice, waitMs),
    replay: async (decision) => need().replayTurn(decision),
    // Reviews need the judge's engine.
    ...((masterEngine ?? hardEngine) && {
      review: async (onProgress: (done: number, total: number) => void) => {
        const e = need();
        const job = e.reviewJob((masterEngine ?? hardEngine)!(e.start.format ?? 'gen4ou'));
        for (;;) {
          const review = job.step(1000);
          onProgress(job.done, job.total);
          if (review) return review;
        }
      },
    }),
    onCoachTip: (onTip) => {
      tipListeners.add(onTip);
      return () => tipListeners.delete(onTip);
    },
    turn: async (format, position, turn, spots, whole) =>
      presentTurn(format, position, turn, spots, whole),
  };
}
