import type { NetSearchResult, NetWorld } from '@daily-battle/engine-wasm';
import { describe, expect, it } from 'vitest';
import type { BranchWorld } from '../facts/branches';
import { winconText, winconTip } from './wincon';

const mon = (name: string, hp: number) => `${name},x,x,x,x,x,${hp},100`;
/** A side (poke-engine layout): six Pokémon, the active slot, filler, force_switch at field 22. */
const side = (names: string[], active: number) =>
  [...names.map((n) => mon(n, 100)), String(active), ...Array(15).fill('x'), 'false'].join('=');
const state =
  side(['salamence', 'blissey', 'a', 'b', 'c', 'd'], 0) +
  '/' +
  side(['swampert', 'skarmory', 'e', 'f', 'g', 'h'], 0);
const hp = (s: string, sd: number, slot: number) =>
  Number(s.split('/')[sd]!.split('=')[slot]!.split(',')[6]);

/** We win once Swampert (foe slot 0) is down, as long as Salamence (our slot 0) is standing. */
const value = (w: NetWorld) => (hp(w.state, 1, 0) > 0 ? 0.4 : hp(w.state, 0, 0) > 0 ? 0.9 : 0.3);
const world: BranchWorld = {
  weight: 1,
  slots: ['move 1', 'switch 2'],
  world: {
    state,
    known: Array.from({ length: 6 }, (_, i) => ({ seen: i < 2 })),
  } as unknown as NetWorld,
  result: {
    prior: [],
    value: 0.4,
    foe: [],
    score: [0.4, 0.3],
    positions: 1,
    replies: [],
    outcomes: [],
  } satisfies NetSearchResult,
};

describe('win-condition tips', () => {
  it('names the blocker and our key Pokémon, tied to the top play', () => {
    expect(winconTip([world], 'move 1', value, () => true)).toMatchObject({
      kind: 'remove',
      blocker: 'swampert',
      key: 'salamence',
      values: { now: 0.4, without: 0.9, withoutKey: 0.3 },
    });
    expect(winconTip([world], 'switch 2', value, () => false)).toMatchObject({ kind: 'keep' });
  });

  it('stays quiet when already winning or no blocker stands out', () => {
    expect(winconTip([world], 'move 1', value, () => true, { now: 0.3 })).toBeUndefined();
    expect(
      winconTip(
        [world],
        'move 1',
        () => 0.5,
        () => true,
      ),
    ).toBeUndefined();
  });

  it('words each kind', () => {
    for (const kind of ['remove', 'keep', 'plan'] as const)
      for (const v of [0, 1]) {
        expect(winconText(kind, { blocker: 'Swampert', key: 'Salamence' }, v)).toContain(
          'Swampert',
        );
        expect(winconText(kind, { blocker: 'Swampert' }, v)).toContain('Swampert');
      }
  });
});
