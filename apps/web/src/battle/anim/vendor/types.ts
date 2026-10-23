// The shapes Showdown's animation tables are written against, narrowed to what
// our scene adapter (../scene.ts) provides.

export interface SpriteData {
  url?: string;
  w: number;
  h: number;
  y?: number;
  gen?: number;
  pixelated?: boolean;
  rawHTML?: string;
}

/** A position in Showdown's scene space: x left/right, y up/down, z near/far. */
export interface ScenePos {
  x?: number;
  y?: number;
  z?: number;
  scale?: number;
  xscale?: number;
  yscale?: number;
  opacity?: number;
  time?: number;
  display?: string;
}

/** A Pokémon (or effect) sprite an animation can move. */
export interface AnimSprite {
  x: number;
  y: number;
  z: number;
  sp: SpriteData;
  isFrontSprite: boolean;
  isMissedPokemon?: boolean;
  delay(time: number): AnimSprite;
  anim(end: ScenePos, transition?: string): AnimSprite;
  behind(offset: number): number;
  behindx(offset: number): number;
  behindy(offset: number): number;
  leftof(offset: number): number;
}

/** What an animation draws with. */
export interface AnimScene {
  battle: { mySide: { x: number; y: number; z: number } };
  showEffect(
    effect: string | SpriteData,
    start: ScenePos,
    end: ScenePos,
    transition: string,
    after?: string,
  ): unknown;
  backgroundEffect(bg: string, duration: number, opacity?: number, delay?: number): void;
  wait(time: number): void;
  timeOffset: number;
  $bg: {
    delay(time: number): unknown;
    animate(props: { top?: number; bottom?: number }, time: number): unknown;
  };
}

interface AnimData {
  anim(scene: AnimScene, args: AnimSprite[]): void;
  prepareAnim?(scene: AnimScene, args: AnimSprite[]): void;
  residualAnim?(scene: AnimScene, args: AnimSprite[]): void;
}
export type AnimTable = { [k: string]: AnimData };
