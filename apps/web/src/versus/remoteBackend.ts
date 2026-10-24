// The battle screen's backend for a live battle: choices go to the room, and
// the room's updates for your side become packages through SidePresenter,
// just as the worker's do for a daily battle.
import type { MatchView } from '@daily-battle/versus';
import type { Protocol } from '@pkmn/protocol';
import type { PokemonSet } from '@pkmn/sim';
import type { BattleBackend } from '../battle/backend';
import type { TurnPackage } from '../battle/frames';
import { SidePresenter } from '../battle/presenter';
import type { Feed } from './feed';
import type { SideMessage } from './useRoom';

/** Shown when the move you picked turns out to be blocked (by Imprison, say). */
const BLOCKED = 'That move can’t be used right now. Choose another.';

/** Several packages as one: all their frames, and where the last one leaves off. */
function merge(pkgs: TurnPackage[]): TurnPackage {
  const last = pkgs.at(-1)!;
  return {
    ...last,
    frames: pkgs.flatMap((p) => p.frames),
    explainers: [...new Set(pkgs.flatMap((p) => p.explainers))],
    // Catching up on more than a turn: show where things stand, without playback.
    resumed: pkgs[0]!.resumed || pkgs.length > 1,
  };
}

export interface RemoteBackend extends BattleBackend {
  /** Follows the battle's feed from where it left off; returns a detach. */
  attach(): () => void;
}

export function remoteBackend(
  view: MatchView,
  feed: Feed<SideMessage>,
  send: { choose: (choice: string) => void; forfeit: () => void },
): RemoteBackend {
  const presenter = new SidePresenter(view.side, view.team as PokemonSet[], view.format);
  let received = 0;
  /** A start, choice, or forfeit waiting for the room's answer. */
  let answer: ((pkg: TurnPackage) => void) | null = null;
  let listener: ((pkg: TurnPackage) => void) | null = null;
  let started = false;
  const queued: TurnPackage[] = [];

  const deliver = (pkg: TurnPackage) => {
    if (answer) {
      const a = answer;
      answer = null;
      a(pkg);
    } else if (started && listener) {
      listener(pkg);
    } else {
      queued.push(pkg);
    }
  };

  /** Feed items handled so far, so re-attaching doesn't replay them. */
  let seen = 0;
  const handle = (msg: SideMessage) => {
    seen++;
    if (msg.match !== view.id) return;
    // After a reconnect the room resends everything: skip what's already here.
    const skip = received - msg.from;
    if (skip < 0) return;
    const fresh = received === 0;
    const lines = msg.update.lines.slice(skip);
    received += lines.length;
    deliver(
      presenter.present(
        {
          lines,
          request: msg.update.request as Protocol.Request | null,
          ended: msg.update.ended,
          winner: msg.update.winner,
        },
        !!msg.resync && fresh,
        msg.update.blocked ? BLOCKED : undefined,
      ),
    );
  };

  const next = () => new Promise<TurnPackage>((resolve) => (answer = resolve));
  // The same opening for every caller (React may start a screen's effects twice).
  let opening: Promise<TurnPackage> | null = null;

  return {
    start: () => {
      started = true;
      opening ??= queued.length ? Promise.resolve(merge(queued.splice(0))) : next();
      return opening;
    },
    choose: (choice) => {
      send.choose(choice);
      return next();
    },
    forfeit: () => {
      send.forfeit();
      return next();
    },
    subscribe: (onPackage) => {
      listener = onPackage;
      if (queued.length) onPackage(merge(queued.splice(0)));
      return () => {
        if (listener === onPackage) listener = null;
      };
    },
    attach: () => feed.listen(handle, seen),
  };
}
