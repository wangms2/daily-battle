import type { NetOutcome, NetSearchResult, NetWorld } from '@daily-battle/engine-wasm';
import { describe, expect, it } from 'vitest';
import type { BranchWorld } from '../facts/branches';
import { preserveText, preserveTip } from './preserve';

const side = (names: string[]) =>
  [...names.map((n) => `${n},x,x,x,x,x,100,100`), '0', ...Array(15).fill('x'), 'false'].join('=');
const state = `${side(['gengar', 'blissey', 'a', 'b', 'c', 'd'])}/${side(['machamp', 'e', 'f', 'g', 'h', 'i'])}`;
const outcome = (own: number, ownKo: number): NetOutcome =>
  ({ own, foe: 0, p: 1, value: 0.5, ownHp: 0, foeHp: 0, ownKo, foeKo: 0 }) as NetOutcome;

/** Gengar attacks (move 1, and faints) or switches to Blissey (switch 2) at these win chances. */
const world = (attack: number, swap: number): BranchWorld => ({
  weight: 1,
  slots: ['move 1', 'switch 2'],
  world: { state, known: [] } as unknown as NetWorld,
  result: {
    prior: [],
    value: 0.5,
    foe: [],
    score: [attack, swap],
    positions: 1,
    replies: [{ slot: 0, p: 1, q: [] }],
    outcomes: [outcome(0, 1), outcome(1, 0)],
  } satisfies NetSearchResult,
});
const legal = ['move 1', 'switch 2'];
const damaging = (c: string) => c === 'move 1';

describe('preserve / sacrifice tips', () => {
  it('keeps a Pokémon we need, and lets one go that we don’t', () => {
    expect(preserveTip([world(0.3, 0.5)], legal, 'switch 2', () => 0.2, damaging)).toMatchObject({
      kind: 'preserve',
      mon: 'gengar',
      contrast: 'move 1',
      danger: 1,
    });
    expect(preserveTip([world(0.5, 0.4)], legal, 'move 1', () => 0.48, damaging)).toMatchObject({
      kind: 'sacrifice',
      contrast: 'switch 2',
    });
  });

  it('stays quiet when the cost doesn’t match the advice', () => {
    expect(preserveTip([world(0.3, 0.5)], legal, 'switch 2', () => 0.45, damaging)).toBeUndefined();
    expect(preserveTip([world(0.5, 0.4)], legal, 'move 1', () => 0.2, damaging)).toBeUndefined();
  });

  it('starts sentences with a capital', () => {
    for (const kind of ['preserve', 'sacrifice'] as const)
      for (const v of [0, 1])
        expect(
          preserveText(
            kind,
            { mon: 'Gengar', choice: 'switching to Blissey', contrast: 'Shadow Ball' },
            v,
          ),
        ).not.toMatch(/(^|\. )[a-z]/);
  });
});
