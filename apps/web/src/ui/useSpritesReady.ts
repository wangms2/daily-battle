import { useEffect, useState } from 'react';
import { loadSprites, type SpriteKind } from '../lib/sprites';

/** Longest wait before showing a list anyway, so one slow sprite can't hold it up. */
const WAIT_MS = 2500;

/**
 * The newest `species` list whose sprites have all loaded: until then the previous
 * list (or null at first), so a set of sprites appears together instead of one by one.
 */
export function useSpritesReady(species: string[], kind: SpriteKind = 'front'): string[] | null {
  const key = species.join('|');
  const [ready, setReady] = useState<{ key: string; species: string[] } | null>(null);

  useEffect(() => {
    if (ready?.key === key) return;
    let live = true;
    const list = key ? key.split('|') : [];
    const show = () => live && setReady({ key, species: list });
    const timer = setTimeout(show, WAIT_MS);
    void loadSprites(list, kind).then(show);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // `ready` is left out on purpose: only a new list starts a load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, kind]);

  return ready?.species ?? null;
}
