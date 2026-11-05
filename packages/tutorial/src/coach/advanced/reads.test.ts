import type { NetSearchResult, NetWorld } from '@daily-battle/engine-wasm';
import { describe, expect, it } from 'vitest';
import type { BranchWorld } from '../facts/branches';
import { readText, readTip } from './reads';

/**
 * Gengar (foe slot 0, active) stays in or switches to Skarmory (slot 1, reply
 * slot 9). Our Shadow Ball (move 1) and Thunderbolt (move 2) at these win
 * chances against [stay, switch].
 */
const world = (pStay: number, shadowBall: number[], thunderbolt: number[]): BranchWorld => ({
  weight: 1,
  slots: ['move 1', 'move 2'],
  world: { state: 'us/gengar,x=skarmory,x=a=b=c=d=0' } as NetWorld,
  result: {
    prior: [],
    value: 0.5,
    foe: [],
    score: [],
    positions: 1,
    replies: [
      { slot: 0, p: pStay, q: [shadowBall[0]!, thunderbolt[0]!] },
      { slot: 9, p: 1 - pStay, q: [shadowBall[1]!, thunderbolt[1]!] },
    ],
    outcomes: [],
  } satisfies NetSearchResult,
});
const legal = ['move 1', 'move 2'];

describe('read tips', () => {
  it('backs a play that holds up against both replies over the greedy one', () => {
    expect(readTip([world(0.5, [0.8, 0.3], [0.65, 0.7])], legal, 'move 2')).toMatchObject({
      kind: 'read',
      choice: 'move 2',
      contrast: 'move 1',
      greedyFor: 'stay',
      foe: 'gengar',
      target: 'skarmory',
    });
  });

  it('stays quiet when one reply is unlikely or the greedy play holds up too', () => {
    expect(readTip([world(0.05, [0.8, 0.3], [0.65, 0.7])], legal, 'move 2')).toBeUndefined();
    expect(readTip([world(0.5, [0.8, 0.66], [0.65, 0.7])], legal, 'move 2')).toBeUndefined();
    expect(readTip([world(0.5, [0.8, 0.3], [0.65, 0.7])], legal, 'move 1')).toBeUndefined();
  });

  it('words each kind with the given names', () => {
    const n = { choice: 'Thunderbolt', contrast: 'Shadow Ball', foe: 'Gengar', target: 'Skarmory' };
    for (const kind of ['read', 'safe', 'cover'] as const)
      for (const greedyFor of ['stay', 'switch'] as const)
        for (const v of [0, 1]) {
          const text = readText({ kind, greedyFor }, n, v);
          expect(text).toContain('Thunderbolt');
          expect(text).toContain('Shadow Ball');
          expect(text).toContain('Skarmory');
        }
  });
});
