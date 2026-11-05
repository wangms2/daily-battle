import { describe, expect, it } from 'vitest';
import { advancedReview, type AdvancedTip } from './review';

const names = {
  play: (c: string) => (c.startsWith('switch') ? 'switching to Skarmory' : `Move${c.slice(5)}`),
  species: (id: string) => id[0]!.toUpperCase() + id.slice(1),
};
const values = { now: 0.4, without: 0.9 };

describe('advanced review texts', () => {
  const tips: AdvancedTip[] = [
    {
      concept: 'risk',
      safe: 'move 1',
      risky: 'move 2',
      bad: 0.3,
      values: { safe: 0.6, risky: 0.5 },
    },
    {
      concept: 'slow',
      kind: 'hazard',
      choice: 'move 1',
      contrast: 'move 2',
      values: { choice: 0.6, contrast: 0.55 },
      worlds: 1,
      targets: [],
    },
    {
      concept: 'slow',
      kind: 'pacing',
      choice: 'move 1',
      contrast: 'move 2',
      values: { choice: 0.7, contrast: 0.5 },
      worlds: 1,
    },
    {
      concept: 'reads',
      kind: 'cover',
      choice: 'move 1',
      contrast: 'switch 2',
      greedyFor: 'switch',
      foe: 'gengar',
      target: 'skarmory',
      pStay: 0.5,
      pTarget: 0.4,
      vsSwitch: { choice: 0.5, contrast: 0.7 },
      vsStay: { choice: 0.6, contrast: 0.3 },
    },
    {
      concept: 'wincon',
      kind: 'remove',
      choice: 'move 1',
      blocker: 'swampert',
      key: 'salamence',
      values,
    },
    {
      concept: 'preserve',
      kind: 'preserve',
      choice: 'switch 2',
      contrast: 'move 1',
      mon: 'gengar',
      danger: 0.8,
      values,
    },
    {
      concept: 'preserve',
      kind: 'sacrifice',
      choice: 'move 1',
      contrast: 'switch 2',
      mon: 'blissey',
      danger: 0.8,
      values,
    },
  ];

  it('words every concept, starting each sentence with a capital', () => {
    for (const tip of tips) {
      const r = advancedReview(tip, names);
      for (const text of [r.followed, r.missed]) {
        expect(text, tip.concept).toMatch(/^[A-Z]/);
        expect(text).not.toMatch(/\. [a-z]/);
        expect(text).not.toMatch(/undefined|NaN/);
      }
    }
  });
});
