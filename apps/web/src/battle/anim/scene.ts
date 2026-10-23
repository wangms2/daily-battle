// The stage Showdown's move animations run on. Their tables (./vendor) call
// `scene.showEffect(...)`, `scene.backgroundEffect(...)`, and move the two
// Pokémon with `sprite.anim(...)`; this class implements those calls with the
// Web Animations API on elements over our battle field, instead of the
// client's jQuery. Positions arrive in Showdown's scene space (x left/right,
// y up/down, z near/far) and are mapped onto our field, anchored on the two
// real sprites so effects land on whatever size of Pokémon is out.
//
// A run is synchronous: the tables queue segments (jQuery-style "delay, then
// animate") and we turn each into one animation with an absolute delay, then
// report how long the whole thing takes. `cancel()` removes everything and
// the sprites snap back to where the field draws them.
import { BattleEffects } from './vendor/effects';
import type { AnimSprite, ScenePos, SpriteData } from './vendor/types';

/** Our field is laid out in the background image's coordinates (see Field.tsx). */
const IMG_X0 = 370;
const IMG_BOTTOM = 385;
const FIELD_W = 440;
const FIELD_H = 295;
/** Your back sprite is drawn this much larger than the foe's front sprite. */
const NEAR_SCALE = 1.4;

/** A bone image has no license we can ship; this effect stands in for it. */
const SUBSTITUTE: Record<string, string> = { 'bone.png': 'wisp.png' };

const EASE: Record<string, string> = {
  linear: 'linear',
  swing: 'cubic-bezier(0.37, 0, 0.63, 1)',
  quadDown: 'cubic-bezier(0.11, 0, 0.5, 0)',
  quadUp: 'cubic-bezier(0.5, 1, 0.89, 1)',
  // jQuery easings Showdown adds: a throw up and back (-3x² + 4x) and its mirror.
  ballisticUp: 'cubic-bezier(0.333, 1.333, 0.667, 1.667)',
  ballisticDown: 'cubic-bezier(0.333, -0.667, 0.667, -0.333)',
};

export interface SpriteRef {
  /** The sprite's <img> on the field. */
  el: HTMLElement;
  /** Its natural size, in image pixels. */
  w: number;
  h: number;
  /** Where it was loaded from, for animations that draw the Pokémon itself. */
  url: string;
}

export interface SceneInit {
  /** The field (a size container), whose box everything is placed in. */
  field: HTMLElement;
  /** The backdrop itself, which a few moves (Earthquake) shake. */
  bg: HTMLElement;
  /** Over the sprites: effect images. */
  layer: HTMLElement;
  /** Under the sprites: full-field color washes and backdrops. */
  bgLayer: HTMLElement;
  you: SpriteRef;
  foe: SpriteRef;
  /** How many times faster than Showdown's normal speed. */
  accel: number;
}

interface Px {
  left: number;
  top: number;
  width: number;
  height: number;
  opacity: number;
  display?: string;
  /** The center, in image coordinates. */
  cx: number;
  cy: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const scaleAt = (z: number) => Math.max(0.1, NEAR_SCALE - (0.4 * z) / 200);

export function fxUrl(file: string): string {
  return `${import.meta.env.BASE_URL}fx/${SUBSTITUTE[file] ?? file}`;
}

/** Rewrites the client URLs inside a background so they point at our own files. */
function localBackground(bg: string): string {
  return bg
    .replace(/https:\/\/showdown\.invalid\/sprites\/gen6bgs\/([\w-]+)\.jpg/g, (_, n: string) =>
      fxUrl(`${n}.png`),
    )
    .replace(/https:\/\/showdown\.invalid\/fx\/([\w.-]+)/g, (_, n: string) => fxUrl(n));
}

/** The slice of jQuery that Earthquake and friends use on the backdrop: a queue of shakes. */
class Shaker {
  private cursor = 0;
  private cur = 0;
  constructor(
    private scene: AnimScene,
    private el: HTMLElement,
  ) {}

  delay(time: number) {
    this.cursor += time;
    return this;
  }

  /** `top` is Showdown's backdrop offset: -90 is at rest, lower is up. */
  animate(props: { top?: number }, time: number) {
    const to = (props.top ?? -90) + 90;
    // Slightly enlarged so the edges never show while it moves.
    const frame = (y: number) => ({ translate: `0 ${y}px`, scale: '1.04' });
    this.scene.add(
      this.el.animate([frame(this.cur), frame(to)], {
        ...this.scene.timing(this.cursor, time),
        easing: 'linear',
        fill: 'forwards',
      }),
    );
    this.cur = to;
    this.cursor += time;
    this.scene.reach(this.cursor);
    return this;
  }
}

class SceneSprite implements AnimSprite {
  x = 0;
  y = 0;
  z: number;
  sp: SpriteData;
  isMissedPokemon = false;
  private cursor = 0;
  private cur = { dx: 0, dy: 0, rx: 1, ry: 1, opacity: 1 };

  constructor(
    private scene: AnimScene,
    private ref: SpriteRef,
    readonly isFrontSprite: boolean,
  ) {
    this.z = isFrontSprite ? 200 : 0;
    this.sp = { url: ref.url, w: ref.w, h: ref.h };
  }

  delay(time: number) {
    this.cursor += time;
    return this;
  }

  anim(end: ScenePos, transition?: string) {
    const e = { x: this.x, y: this.y, z: this.z, scale: 1, opacity: 1, time: 500, ...end };
    const base = this.scene.place({ x: this.x, y: this.y, z: this.z }, this.sp);
    const to = this.scene.place(e, this.sp);
    const ease = this.scene.easings(transition, to, base, e);
    const next = {
      dx: to.left + to.width / 2 - (base.left + base.width / 2),
      dy: to.top + to.height / 2 - (base.top + base.height / 2),
      rx: to.width / base.width,
      ry: to.height / base.height,
      opacity: e.opacity,
    };
    const from = this.cur;
    const timing = this.scene.timing(this.cursor, e.time);
    const run = (keyframes: Keyframe[], easing: string) =>
      this.scene.add(this.ref.el.animate(keyframes, { ...timing, easing, fill: 'forwards' }));
    run(
      [
        { transform: `translate(${from.dx}px, 0) scale(${from.rx}, ${from.ry})` },
        { transform: `translate(${next.dx}px, 0) scale(${next.rx}, ${next.ry})` },
      ],
      ease.all,
    );
    run([{ translate: `0 ${from.dy}px` }, { translate: `0 ${next.dy}px` }], ease.top);
    run([{ opacity: from.opacity }, { opacity: next.opacity }], 'linear');
    this.cur = next;
    this.cursor += e.time;
    this.scene.reach(this.cursor);
    return this;
  }

  behindx(offset: number) {
    return this.x + (this.isFrontSprite ? 1 : -1) * offset;
  }
  behindy(offset: number) {
    return this.y + (this.isFrontSprite ? -1 : 1) * offset;
  }
  leftof(offset: number) {
    return this.x + (this.isFrontSprite ? 1 : -1) * offset;
  }
  behind(offset: number) {
    return this.z + (this.isFrontSprite ? 1 : -1) * offset;
  }
}

export class AnimScene {
  /** Showdown's `scene.timeOffset`: added to the start of every effect after `wait()`. */
  timeOffset = 0;
  readonly battle = { mySide: { x: 0, y: 0, z: 0 } };
  readonly you: SceneSprite;
  readonly foe: SceneSprite;
  readonly $bg: Shaker;
  private anims: Animation[] = [];
  private els: HTMLElement[] = [];
  /** The latest end of any segment, in Showdown's (unscaled) milliseconds. */
  private last = 0;
  private fw: number;
  private fh: number;
  private anchor: { you: { x: number; y: number }; foe: { x: number; y: number } };

  constructor(private init: SceneInit) {
    this.fw = init.field.clientWidth;
    this.fh = init.field.clientHeight;
    this.you = new SceneSprite(this, init.you, false);
    this.foe = new SceneSprite(this, init.foe, true);
    this.$bg = new Shaker(this, init.bg);
    // The two sprites' centers, in image coordinates (see SPOT in Field.tsx).
    this.anchor = {
      you: { x: 250, y: 382 - (init.you.h * NEAR_SCALE) / 2 },
      foe: { x: 480, y: 255 - init.foe.h / 2 },
    };
  }

  /** Milliseconds the run takes at the chosen speed. */
  get duration() {
    return this.last / this.init.accel;
  }

  // Showdown's pos(): where a scene-space point and size land on our field.
  place(loc: ScenePos, sp: SpriteData): Px {
    const { x = 0, y = 0, z = 0, scale = 1, opacity = 1, display } = loc;
    const xscale = loc.xscale ?? scale;
    const yscale = loc.yscale ?? scale;
    const t = z / 200;
    const k = scaleAt(z);
    const cx = lerp(this.anchor.you.x, this.anchor.foe.x, t) + Math.floor(x * k);
    const cy = lerp(this.anchor.you.y, this.anchor.foe.y, t) - Math.floor(y * k);
    const s = Math.max(this.fw / FIELD_W, this.fh / FIELD_H);
    const width = Math.floor(sp.w * k * xscale * s);
    const height = Math.floor(sp.h * k * yscale * s);
    const px = this.fw / 2 + s * (cx - IMG_X0);
    const py = this.fh - s * (IMG_BOTTOM - cy);
    return {
      left: px - width / 2,
      top: py - height / 2,
      width,
      height,
      opacity,
      display,
      cx,
      cy,
    };
  }

  /** Showdown's posT() transition names, as CSS easings for the vertical and the other axes. */
  easings(transition: string | undefined, to: Px, from: Px, loc: ScenePos) {
    let top = 'linear';
    let all = 'linear';
    const up = to.top < from.top;
    switch (transition) {
      case 'ballistic':
        top = up ? EASE.ballisticUp! : EASE.ballisticDown!;
        break;
      case 'ballisticUnder':
        top = up ? EASE.ballisticDown! : EASE.ballisticUp!;
        break;
      case 'ballistic2':
        top = up ? EASE.quadUp! : EASE.quadDown!;
        break;
      case 'ballistic2Back':
        top = (loc.z ?? 0) > 0 ? EASE.quadUp! : EASE.quadDown!;
        break;
      case 'ballistic2Under':
        top = up ? EASE.quadDown! : EASE.quadUp!;
        break;
      case 'swing':
        all = top = EASE.swing!;
        break;
      case 'accel':
        all = top = EASE.quadDown!;
        break;
      case 'decel':
        all = top = EASE.quadUp!;
        break;
    }
    return { all, top };
  }

  /** Animation timing for a segment starting `at` ms in, scaled by the speed. */
  timing(at: number, duration: number): { delay: number; duration: number } {
    return { delay: at / this.init.accel, duration: Math.max(0, duration) / this.init.accel };
  }

  add(a: Animation) {
    this.anims.push(a);
  }

  reach(t: number) {
    if (t > this.last) this.last = t;
  }

  wait(time: number) {
    this.timeOffset += time;
  }

  showEffect(
    effect: string | SpriteData,
    start: ScenePos,
    end: ScenePos,
    transition: string,
    after?: string,
  ) {
    const sp = typeof effect === 'string' ? BattleEffects[effect] : effect;
    if (!sp?.url) return null;
    const img = document.createElement('img');
    img.src = typeof effect === 'string' ? fxUrl(sp.url) : sp.url;
    img.alt = '';
    img.draggable = false;
    img.style.cssText = 'position:absolute;display:block;max-width:none;pointer-events:none';
    if (typeof effect !== 'string') img.style.imageRendering = 'pixelated';
    this.init.layer.append(img);
    this.els.push(img);
    this.animateEffect(img, sp, start, end, transition, after);
    return img;
  }

  private animateEffect(
    el: HTMLElement,
    sp: SpriteData,
    startIn: ScenePos,
    endIn: ScenePos,
    transition: string,
    after?: string,
  ) {
    const start = { ...startIn, time: startIn.time || 0 };
    const end = { ...endIn, time: endIn.time || start.time + 500 };
    start.time += this.timeOffset;
    end.time += this.timeOffset;
    if (!end.scale && end.scale !== 0 && start.scale) end.scale = start.scale;
    if (!end.xscale && end.xscale !== 0 && start.xscale) end.xscale = start.xscale;
    if (!end.yscale && end.yscale !== 0 && start.yscale) end.yscale = start.yscale;
    const full = { ...start, ...end };

    const a = this.place(start, sp);
    const b = this.place(full, sp);
    const ease = this.easings(transition, b, a, full);
    const box = (p: Px) => ({
      left: `${p.left}px`,
      top: `${p.top}px`,
      width: `${p.width}px`,
      height: `${p.height}px`,
    });
    Object.assign(el.style, box(a), { opacity: start.time ? '0' : String(a.opacity) });
    if (a.display) el.style.display = a.display;

    const appear = this.timing(start.time, 1);
    if (start.time) {
      this.add(
        el.animate([{ opacity: 0 }, { opacity: a.opacity }], { ...appear, fill: 'forwards' }),
      );
    }
    const dur = full.time - start.time;
    const move = { ...this.timing(start.time, dur), fill: 'forwards' as const };
    const from = box(a);
    const to = box(b);
    this.add(
      el.animate(
        [
          { left: from.left, width: from.width, height: from.height },
          { left: to.left, width: to.width, height: to.height },
        ],
        { ...move, easing: ease.all },
      ),
    );
    this.add(el.animate([{ top: from.top }, { top: to.top }], { ...move, easing: ease.top }));
    if (a.opacity !== b.opacity) {
      this.add(
        el.animate([{ opacity: a.opacity }, { opacity: b.opacity }], { ...move, easing: 'linear' }),
      );
    }
    let endAt = full.time;
    if (after === 'fade') {
      this.add(
        el.animate([{ opacity: b.opacity }, { opacity: 0 }], {
          ...this.timing(endAt, 100),
          fill: 'forwards',
        }),
      );
      endAt += 100;
    } else if (after === 'explode') {
      const big = { ...full, opacity: 0 };
      if (big.scale) big.scale *= 3;
      if (big.xscale) big.xscale *= 3;
      if (big.yscale) big.yscale *= 3;
      const c = this.place(big, sp);
      const t = this.timing(endAt, 200);
      this.add(
        el.animate(
          [
            { left: to.left, top: to.top, width: to.width, height: to.height, opacity: b.opacity },
            {
              left: `${c.left}px`,
              top: `${c.top}px`,
              width: `${c.width}px`,
              height: `${c.height}px`,
              opacity: 0,
            },
          ],
          { ...t, fill: 'forwards' },
        ),
      );
      endAt += 200;
    }
    this.reach(endAt);
  }

  /** A color wash or backdrop over the whole field, under the sprites. */
  backgroundEffect(bg: string, duration: number, opacity = 1, delay = 0) {
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;inset:0;background-size:cover;background-position:center';
    el.style.background = localBackground(bg);
    el.style.backgroundSize = 'cover';
    el.style.opacity = '0';
    this.init.bgLayer.append(el);
    this.els.push(el);
    const total = delay + duration + 250;
    this.add(
      el.animate(
        [
          { opacity: 0, offset: 0 },
          { opacity: 0, offset: delay / total },
          { opacity, offset: (delay + 250) / total },
          { opacity, offset: (delay + duration) / total },
          { opacity: 0, offset: 1 },
        ],
        { ...this.timing(0, total), fill: 'forwards' },
      ),
    );
    this.reach(total);
  }

  /** Removes everything the run added and hands the sprites back. */
  cancel() {
    for (const a of this.anims) a.cancel();
    for (const el of this.els) el.remove();
    this.anims = [];
    this.els = [];
  }
}
