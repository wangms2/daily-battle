import type { NetOutcome, NetSearchResult } from '@daily-battle/engine-wasm';
import { describe, expect, it } from 'vitest';
import { branchKind, risk, type BranchWorld } from './branches';

const o = (
  own: number,
  p: number,
  value: number,
  change: Partial<NetOutcome> = {},
): NetOutcome => ({
  own,
  foe: 0,
  p,
  value,
  ownHp: 0.2,
  foeHp: 0.5,
  ownKo: 0,
  foeKo: 0,
  ...change,
});

/** Surf (slot 0) always hits for 0.6; Hydro Pump (slot 1) KOs 80% of the time, else misses and loses. */
const world = (weight = 1): BranchWorld => {
  const outcomes = [
    o(0, 1, 0.6),
    o(1, 0.8, 0.7, { foeHp: 1, foeKo: 1 }),
    o(1, 0.2, 0.1, { foeHp: 0 }),
  ];
  const q = [0.6, 0.8 * 0.7 + 0.2 * 0.1];
  return {
    weight,
    slots: ['move 1', 'move 2'],
    result: {
      prior: [],
      value: 0.6,
      foe: [],
      score: q,
      positions: 1,
      replies: [{ slot: 0, p: 1, q }],
      outcomes,
    } satisfies NetSearchResult,
  };
};

describe('branch odds', () => {
  it("finds the risky choice's losing miss", () => {
    expect(risk([world(), world()], 'move 2', 0.3, 'move 1')).toEqual({
      bad: 0.2,
      kind: 'miss',
      kindShare: 1,
      worlds: 1,
    });
    expect(risk([world()], 'move 1', 0.3)).toMatchObject({ bad: 0 });
  });

  it('tells a miss from a painful turn', () => {
    const usual = o(0, 0.9, 0.5);
    expect(branchKind(o(0, 0.1, 0.1, { foeHp: 0 }), usual)).toBe('miss');
    expect(branchKind(o(0, 0.1, 0.1, { ownKo: 1 }), usual)).toBe('hurt');
    expect(branchKind(o(0, 0.1, 0.4, { foeHp: 0.4 }), usual)).toBe('other');
  });

  it('needs the outcomes', () => {
    const w = world();
    expect(risk([{ ...w, result: { ...w.result, outcomes: [] } }], 'move 2', 0.3)).toBeUndefined();
  });
});
