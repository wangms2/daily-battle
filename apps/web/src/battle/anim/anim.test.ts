import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Frame } from '../frames';
import { ANIMATED, playMove, playStatus, type SceneInit } from './play';
import { AnimScene, fxUrl } from './scene';
import { BattleEffects } from './vendor/effects';

type Ev = NonNullable<Frame['event']>;

const sprite = (w: number, h: number) => ({
  el: document.createElement('img'),
  w,
  h,
  url: 'sprite.png',
});
const init = (accel = 1): SceneInit => {
  const field = document.createElement('div');
  Object.defineProperty(field, 'clientWidth', { value: 400 });
  Object.defineProperty(field, 'clientHeight', { value: 300 });
  return {
    field,
    bg: document.createElement('div'),
    layer: document.createElement('div'),
    bgLayer: document.createElement('div'),
    you: sprite(80, 80),
    foe: sprite(64, 96),
    accel,
  };
};

let animated = 0;
beforeAll(() => {
  // jsdom has no Web Animations API.
  Element.prototype.animate = function () {
    animated++;
    return { cancel() {} } as unknown as Animation;
  };
});
afterEach(() => vi.restoreAllMocks());

describe('Showdown move animations', () => {
  it('has an animation for the moves of both generations', () => {
    for (const id of ['earthquake', 'thunderbolt', 'closecombat', 'stealthrock', 'swordsdance']) {
      expect(ANIMATED.moves, id).toContain(id);
    }
  });

  it('every move animation runs against the scene, aimed at the foe, at itself, and quickly', () => {
    const failures: string[] = [];
    for (const id of ANIMATED.moves) {
      for (const [who, target, accel] of [
        ['you', 'foe', 1],
        ['foe', 'you', 1.4],
        ['you', 'you', 1],
        ['you', 'foe', 3],
      ] as const) {
        const ev: Ev = { kind: 'move', who, target, move: id };
        const ctx = init(accel);
        const run = playMove(ctx, ev);
        if (!run || !(run.duration >= 0) || run.duration > 12000)
          failures.push(`${id} ${who}→${target}`);
        run?.cancel();
        expect(ctx.layer.childElementCount).toBe(0);
      }
    }
    expect(failures).toEqual([]);
    expect(animated).toBeGreaterThan(1000);
  });

  it('falls back to the tackle animation for a move it does not know', () => {
    const run = playMove(init(), {
      kind: 'move',
      who: 'you',
      target: 'foe',
      move: 'Imaginary Move',
    });
    expect(run?.duration).toBeGreaterThan(0);
  });

  it('shows nothing for a [still] move or a move without a name', () => {
    expect(playMove(init(), { kind: 'move', who: 'you', move: 'Tackle', still: true })).toBeNull();
    expect(playMove(init(), { kind: 'move', who: 'you' })).toBeNull();
  });

  it('plays the status animations', () => {
    for (const status of ['brn', 'par', 'psn', 'tox', 'slp', 'frz']) {
      const run = playStatus(init(), { kind: 'status', who: 'foe', status } as Ev);
      expect(run, status).not.toBeNull();
      run?.cancel();
    }
  });

  it('runs faster at a higher speed', () => {
    const slow = playMove(init(1), {
      kind: 'move',
      who: 'you',
      target: 'foe',
      move: 'Thunderbolt',
    });
    const fast = playMove(init(2), {
      kind: 'move',
      who: 'you',
      target: 'foe',
      move: 'Thunderbolt',
    });
    expect(fast!.duration).toBeCloseTo(slow!.duration / 2, 3);
  });

  it('maps a sprite at the near spot onto the field and back to where it was', () => {
    const scene = new AnimScene(init());
    const base = scene.place({ x: 0, y: 0, z: 0 }, { w: 80, h: 80 });
    const same = scene.place({ x: 0, y: 0, z: 0 }, { w: 80, h: 80 });
    expect(same).toEqual(base);
    // Far is up and to the right of near, and smaller.
    const far = scene.place({ x: 0, y: 0, z: 200 }, { w: 80, h: 80 });
    expect(far.left).toBeGreaterThan(base.left);
    expect(far.top).toBeLessThan(base.top);
    expect(far.width).toBeLessThan(base.width);
  });
});

describe('Showdown effect images', () => {
  const root = resolve(process.cwd(), 'public/fx') + '/';

  it('ships every image the animations draw with', () => {
    const missing = Object.values(BattleEffects)
      .map((e) => e.url)
      .filter((u): u is string => !!u)
      .filter((u) => !existsSync(root + fxUrl(u).split('/fx/')[1]!));
    expect(missing).toEqual([]);
  });

  it('does not ship the unlicensed bone image', () => {
    expect(existsSync(root + 'bone.png')).toBe(false);
    expect(fxUrl('bone.png')).not.toContain('bone');
  });
});
