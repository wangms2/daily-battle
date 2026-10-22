import { describe, expect, it } from 'vitest';
import type { ResolvedSet } from './resolve';
import { usageShares } from './resolve';
import { MAX_SETS, MIN_WEIGHT, scoreSet, selectAndWeight } from './weights';

const usage = usageShares({
  'Raw count': 100,
  usage: 0.1,
  Abilities: { intimidate: 100 },
  Items: { leftovers: 80, lifeorb: 20 },
  Moves: { dragondance: 90, waterfall: 90, earthquake: 70, stoneedge: 40, bounce: 1 },
  Natures: { Adamant: 60, Jolly: 40 },
});

const base: ResolvedSet = {
  species: 'Gyarados',
  moves: ['Dragon Dance', 'Waterfall', 'Earthquake', 'Stone Edge'],
  item: 'Leftovers',
  ability: 'Intimidate',
  nature: 'Adamant',
  evs: { hp: 4, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 },
  ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
};

describe('scoreSet', () => {
  it('ranks a common set above a fringe one', () => {
    const fringe = {
      ...base,
      moves: ['Dragon Dance', 'Waterfall', 'Earthquake', 'Bounce'],
      item: 'Life Orb',
    };
    expect(scoreSet(base, usage)).toBeGreaterThan(scoreSet(fringe, usage));
  });

  it('floors unseen moves instead of scoring zero', () => {
    const splash = { ...base, moves: ['Dragon Dance', 'Waterfall', 'Earthquake', 'Splash'] };
    expect(scoreSet(splash, usage)).toBeGreaterThan(0);
  });
});

describe('selectAndWeight', () => {
  it(`keeps at most ${MAX_SETS} and sums to 1`, () => {
    const scored = [5, 1, 3, 2, 4, 0.1].map((score, item) => ({ item, score }));
    const result = selectAndWeight(scored);
    expect(result.map((r) => r.item)).toEqual([0, 4, 2, 3]);
    expect(result.reduce((a, r) => a + r.weight, 0)).toBeCloseTo(1, 10);
  });

  it('keeps rare sets, lifted to the minimum weight, with the top set first', () => {
    const result = selectAndWeight([
      { item: 'a', score: 100 },
      { item: 'b', score: 1 },
    ]);
    expect(result.map((r) => r.item)).toEqual(['a', 'b']);
    expect(result[1]!.weight).toBe(MIN_WEIGHT);
    expect(result[0]!.weight).toBeCloseTo(1 - MIN_WEIGHT, 10);
  });
});
