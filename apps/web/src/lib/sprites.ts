// All sprite access goes through here (DESIGN.md §12.3a), so styles and sources
// can change without touching the UI. Files are self-hosted under /sprites.
import { toId } from './data';

export type SpriteKind = 'front' | 'back' | 'icon';
export type SpriteStyle = 'animated';

const DIRS: Record<SpriteKind, { dir: string; ext: string }> = {
  front: { dir: 'front', ext: 'gif' },
  back: { dir: 'back', ext: 'gif' },
  icon: { dir: 'icons', ext: 'png' },
};

export function getSprite(
  species: string,
  kind: SpriteKind = 'front',
  _style: SpriteStyle = 'animated',
): string {
  const { dir, ext } = DIRS[kind];
  return `${import.meta.env.BASE_URL}sprites/${dir}/${toId(species)}.${ext}`;
}

/** Warms the browser cache so sprites appear without pop-in. */
export function preloadSprites(species: string[], kind: SpriteKind = 'front'): void {
  for (const s of species) {
    const img = new Image();
    img.src = getSprite(s, kind);
  }
}
