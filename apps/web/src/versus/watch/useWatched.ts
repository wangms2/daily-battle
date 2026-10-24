// One battle as a spectator sees it: its public log through a spectator
// presenter, played back a frame at a time so it reads as live, catching up
// at once when far behind (opening the view mid-battle, say).
import { useEffect, useRef, useState } from 'react';
import type { Frame, View } from '../../battle/frames';
import { SidePresenter } from '../../battle/presenter';
import type { Anim, Float } from '../../battle/ui/Field';
import { textLines } from '../../battle/ui/labels';
import type { Feed } from '../feed';
import type { WatchMessage } from '../useRoom';

/** Time per frame of playback; a little quicker than Normal battle speed. */
const STEP_MS = 550;
/** Further behind than this, skip ahead to the last few frames. */
const BEHIND = 12;

export interface Watched {
  view: View | null;
  /** Recent battle text, oldest first. */
  log: string[];
  anim: Anim | null;
  floats: Float[];
  ended: boolean;
}

export function useWatched(
  feed: Feed<WatchMessage>,
  format: string,
): Watched & {
  floatDone: (id: number) => void;
} {
  const [state, setState] = useState<Watched>({
    view: null,
    log: [],
    anim: null,
    floats: [],
    ended: false,
  });
  const key = useRef(0);

  useEffect(() => {
    const presenter = new SidePresenter('p1', [], format, true);
    let received = 0;
    let ended = false;
    const queue: Frame[] = [];
    let timer: number | undefined;
    const step = () => {
      const frames = queue.splice(0, queue.length > BEHIND ? queue.length - 6 : 1);
      const last = frames.at(-1);
      const caughtUp = !queue.length;
      if (last) {
        const lines = frames.flatMap((f) => textLines(f.text));
        setState((s) => ({
          view: last.view,
          log: [...s.log, ...lines].slice(-80),
          anim: last.event
            ? { kind: last.event.kind, who: last.event.who, key: ++key.current }
            : s.anim,
          floats:
            frames.length === 1 && (last.label || last.popup)
              ? [...s.floats.slice(-3), { id: ++key.current, label: last.label, popup: last.popup }]
              : s.floats,
          ended: caughtUp && ended,
        }));
      }
      timer = caughtUp ? undefined : window.setTimeout(step, STEP_MS);
    };
    const unlisten = feed.listen((msg) => {
      const skip = received - msg.from;
      if (skip < 0) return;
      const lines = msg.lines.slice(skip);
      received += lines.length;
      ended ||= msg.ended;
      const pkg = presenter.present(
        { lines, request: null, ended: msg.ended, winner: msg.winner },
        false,
      );
      queue.push(...pkg.frames);
      if (timer === undefined) step();
      if (ended && !queue.length) setState((s) => ({ ...s, ended: true }));
    });
    return () => {
      unlisten();
      window.clearTimeout(timer);
    };
  }, [feed, format]);

  return {
    ...state,
    floatDone: (id) => setState((s) => ({ ...s, floats: s.floats.filter((f) => f.id !== id) })),
  };
}
