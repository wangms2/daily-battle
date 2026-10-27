// All sprite access goes through here (DESIGN.md §12.3a), so styles and sources
// can change without touching the UI. Files are self-hosted under /sprites.
import { genOf } from '@daily-battle/data';
import { activeFormat, toId } from './data';

export type SpriteKind = 'front' | 'back' | 'icon';
/** 'animated' GIFs, or 'still' first frames (animations off, or reduced motion). */
export type SpriteStyle = 'animated' | 'still';

const DIRS: Record<SpriteStyle, Record<SpriteKind, { dir: string; ext: string }>> = {
  animated: {
    front: { dir: 'front', ext: 'gif' },
    back: { dir: 'back', ext: 'gif' },
    icon: { dir: 'icons', ext: 'png' },
  },
  still: {
    front: { dir: 'front-still', ext: 'png' },
    back: { dir: 'back-still', ext: 'png' },
    icon: { dir: 'icons', ext: 'png' },
  },
};

let defaultStyle: SpriteStyle = 'animated';

/**
 * Sets the style sprites use unless asked otherwise. The app sets it from the
 * Animations setting and the system's reduced-motion preference on each render.
 */
export function setSpriteStyle(style: SpriteStyle): void {
  defaultStyle = style;
}

export function getSprite(
  species: string,
  kind: SpriteKind = 'front',
  style: SpriteStyle = defaultStyle,
  /** The generation's art; the active game's unless a screen shows other games (the home screens). */
  gen: number = genOf(activeFormat()),
): string {
  // Gen 3 battles look like Ruby, Sapphire, and Emerald: the games' own still
  // sprites, front and back (Showdown's substitute doll stays shared).
  if (kind !== 'icon' && species !== 'Substitute' && gen === 3) {
    return `${import.meta.env.BASE_URL}sprites/gen3/${kind}/${toId(species)}.png`;
  }
  const { dir, ext } = DIRS[style][kind];
  return `${import.meta.env.BASE_URL}sprites/${dir}/${toId(species)}.${ext}`;
}

/** Warms the browser cache so sprites appear without pop-in. */
export function preloadSprites(species: string[], kind: SpriteKind = 'front'): void {
  for (const s of species) {
    const img = new Image();
    img.src = getSprite(s, kind);
  }
}

/** Resolves once every sprite has loaded and decoded (a broken one counts as done). */
export function loadSprites(species: string[], kind: SpriteKind = 'front'): Promise<void> {
  return Promise.all(
    species.map((s) => {
      const img = new Image();
      img.src = getSprite(s, kind);
      // jsdom has no decode(); there, treat it as loaded.
      return typeof img.decode === 'function' ? img.decode().catch(() => undefined) : undefined;
    }),
  ).then(() => undefined);
}
