// The backend for a review turn (the coach's review, DESIGN.md §22): the battle
// rebuilt to one of your past decisions, and that turn as you played it. The
// battle screen runs on it in review mode, so the replay looks like the battle.
import type { BattleBackend } from './backend';
import type { TurnReplay } from './frames';

export function replayBackend(load: () => Promise<TurnReplay | null>): BattleBackend {
  let replay: Promise<TurnReplay> | null = null;
  const loaded = () =>
    (replay ??= load().then((r) => {
      if (!r) throw new Error('This turn couldn’t load.');
      return r;
    }));
  return {
    start: () => loaded().then((r) => r.before),
    // The turn, whatever is chosen: review mode only plays the choice you made.
    choose: () => loaded().then((r) => r.turn),
    forfeit: () => Promise.reject(new Error('A review turn can’t be given up')),
  };
}
