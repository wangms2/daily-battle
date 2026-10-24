// Runs Showdown's animation for one battle event on the field. This module and
// everything under ./vendor is loaded on demand (see Battle.tsx), so the brief
// and builder never pay for the animation tables.
import type { Frame, Who } from '../frames';
import { AnimScene, type SceneInit } from './scene';
import { BattleMoveAnims } from './vendor/moves';
import { BattleOtherAnims, BattleStatusAnims } from './vendor/other';
import type { AnimSprite } from './vendor/types';

export type { SceneInit } from './scene';

/** A running animation: how long it takes, and how to stop it. */
export interface Running {
  duration: number;
  cancel(): void;
}

const toID = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

/** Showdown plays its quick, generic animations from this speed up. */
const QUICK_FROM = 3;

function sprites(scene: AnimScene, who: Who | undefined, target: Who | undefined) {
  const of = (w: Who) => (w === 'you' ? scene.you : scene.foe);
  const attacker = of(who ?? 'you');
  return [attacker, target ? of(target) : attacker] as AnimSprite[];
}

function run(scene: AnimScene, anim: () => void): Running | null {
  try {
    anim();
  } catch {
    // A broken animation must never break the battle: drop it.
    scene.cancel();
    return null;
  }
  return { duration: scene.duration, cancel: () => scene.cancel() };
}

/** The animation for a move event (`|move|…`), or null if it has none to show. */
export function playMove(init: SceneInit, event: NonNullable<Frame['event']>): Running | null {
  if (event.kind !== 'move' || event.still || !event.move) return null;
  const scene = new AnimScene(init);
  const args = sprites(scene, event.who, event.target);
  const self = args[0] === args[1];
  const quick = init.accel >= QUICK_FROM;
  const entry = quick
    ? BattleOtherAnims[self ? 'fastanimself' : event.special ? 'fastanimspecial' : 'fastanimattack']
    : BattleMoveAnims[toID(event.move)];
  // A few entries (Razor Wind) only animate their charge turn: use the tackle.
  const anim = entry?.anim ?? BattleMoveAnims.tackle!.anim;
  return run(scene, () => anim(scene, args));
}

/** The animation for a new status condition (burn, paralysis, sleep, …). */
export function playStatus(init: SceneInit, event: NonNullable<Frame['event']>): Running | null {
  if (event.kind !== 'status' || !event.status || init.accel >= QUICK_FROM) return null;
  const id = event.status === 'tox' ? 'psn' : event.status;
  const entry = BattleStatusAnims[id];
  if (!entry) return null;
  const scene = new AnimScene(init);
  const target = event.who ?? 'you';
  return run(scene, () => entry.anim(scene, sprites(scene, target, undefined)));
}

/** Showdown's Mega Evolution burst (`|-mega|`), at any speed: it's a once-a-battle moment. */
export function playMega(init: SceneInit, event: NonNullable<Frame['event']>): Running | null {
  if (event.kind !== 'mega') return null;
  const entry = BattleOtherAnims.megaevo;
  if (!entry) return null;
  const scene = new AnimScene(init);
  return run(scene, () => entry.anim(scene, sprites(scene, event.who, undefined)));
}

/** The names of every move and status that has an animation (for tests). */
export const ANIMATED = {
  moves: Object.keys(BattleMoveAnims),
  statuses: Object.keys(BattleStatusAnims),
};
