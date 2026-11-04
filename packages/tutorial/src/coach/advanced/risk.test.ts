import type { NetOutcome } from '@daily-battle/engine-wasm';
import { describe, expect, it } from 'vitest';
import type { BranchWorld } from '../facts/branches';
import { riskTip } from './risk';

const o = (own: number, p: number, value: number, foeHp = 0.5): NetOutcome => ({
  own,
  foe: 0,
  p,
  value,
  ownHp: 0.2,
  foeHp,
  ownKo: 0,
  foeKo: 0,
});

/** Surf (move 1) always hits for 0.6; Hydro Pump (move 2) hits for 0.6 75% of the time, else misses and loses. */
const world = (hit = 0.75): BranchWorld => {
  const outcomes = [o(0, 1, 0.6), o(1, hit, 0.6, 1), o(1, 1 - hit, 0.1, 0)];
  const q = [0.6, hit * 0.6 + (1 - hit) * 0.1];
  return {
    weight: 1,
    slots: ['move 1', 'move 2'],
    result: {
      prior: [],
      value: 0.6,
      foe: [],
      score: q,
      positions: 1,
      replies: [{ slot: 0, p: 1, q }],
      outcomes,
    },
  };
};

const legal = ['move 1', 'move 2'];
const acc = (c: string) => (c === 'move 2' ? 80 : 100);

describe('risk tips', () => {
  it('flags a costly miss next to a safe top choice', () => {
    expect(riskTip([world(), world()], legal, 'move 1', acc)).toMatchObject({
      safe: 'move 1',
      risky: 'move 2',
      bad: 0.25,
    });
  });

  it('stays quiet for a move that cannot miss, or when the safe move is the risky one', () => {
    expect(riskTip([world()], legal, 'move 1', () => 100)).toBeUndefined();
    expect(riskTip([world()], legal, 'move 2', acc)).toBeUndefined();
  });

  it('needs the safe choice clearly ahead, in most worlds', () => {
    expect(riskTip([world(0.95)], legal, 'move 1', acc)).toBeUndefined();
    expect(riskTip([world(), world(0.95)], legal, 'move 1', acc)).toBeUndefined();
  });
});
