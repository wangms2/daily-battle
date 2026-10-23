// All sprite access goes through here (DESIGN.md §12.3a), so styles and sources
// can change without touching the UI. Files are self-hosted under /sprites.
import { toId } from './data';

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
): string {
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
