import type { NetSearchResult } from '@daily-battle/engine-wasm';
import { describe, expect, it } from 'vitest';
import type { BranchWorld } from '../facts/branches';
import { slowText, slowTip } from './slow';

/** Recover (move 1) and Surf (move 2) at these win chances. */
const world = (recover: number, surf: number): BranchWorld => ({
  weight: 1,
  slots: ['move 1', 'move 2'],
  result: {
    prior: [],
    value: recover,
    foe: [],
    score: [recover, surf],
    positions: 1,
    replies: [],
    outcomes: [],
  } satisfies NetSearchResult,
});
const legal = ['move 1', 'move 2'];
const id = (c: string) => (c === 'move 1' ? 'recover' : 'surf');
const damaging = (c: string) => c === 'move 2';

describe('pacing tips', () => {
  it('flags a heal that clearly beats attacking in most worlds', () => {
    expect(slowTip([world(0.7, 0.5)], legal, 'move 1', id, damaging, 3)).toMatchObject({
      kind: 'pacing',
      choice: 'move 1',
      contrast: 'move 2',
    });
  });

  it('stays quiet when the lead is small or not in most worlds', () => {
    expect(slowTip([world(0.6, 0.5)], legal, 'move 1', id, damaging, 3)).toBeUndefined();
    expect(
      slowTip([world(0.9, 0.5), world(0.5, 0.5)], legal, 'move 1', id, damaging, 3),
    ).toBeUndefined();
    expect(slowTip([world(0.7, 0.5)], legal, 'move 2', id, damaging, 3)).toBeUndefined();
  });
});

describe('hazards & pacing wordings', () => {
  const names = {
    move: 'Stealth Rock',
    contrast: 'Earthquake',
    foe: 'Gyarados',
    targets: [
      { name: 'Zapdos', frac: 1 / 4 },
      { name: 'Charizard', frac: 1 / 2 },
      { name: 'Skarmory', frac: 1 / 8 },
    ],
  };

  it('words Stealth Rock from its targets, biggest hit first', () => {
    expect(slowText('stealthrock', names, 0)).toBe(
      'Good time for Stealth Rock: every time they switch in, Charizard would lose 1/2 of its HP, Zapdos 1/4 and Skarmory 1/8.',
    );
  });

  it('uses only the names it is given', () => {
    for (const move of ['spikes', 'recover', 'substitute', 'willowisp', 'healbell'])
      for (const v of [0, 1]) {
        const text = slowText(move, { ...names, move: 'Move' }, v);
        const rest = ['Move', 'Earthquake', 'Gyarados', 'Zapdos', 'Charizard', 'Skarmory']
          .reduce((s, n) => s.replaceAll(n, ''), text)
          .replace(/^[A-Z][a-z]+/, '');
        expect(rest, text).not.toMatch(/(?<![.:] )\b[A-Z][a-z]+/);
      }
  });
});
