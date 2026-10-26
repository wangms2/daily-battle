import { afterEach, describe, expect, it } from 'vitest';
import { deriveSeed, makeRng } from '@daily-battle/sim-bridge';
import { setActiveFormat, speciesInfo } from './data';
import { answered, makeQuestion, matchupKey, nextQuestion } from './typeTrainer';

describe('type trainer', () => {
  afterEach(() => setActiveFormat('gen3ou'));

  it('multiplies the attack against each of the defender’s types', () => {
    setActiveFormat('gen3ou');
    expect(makeQuestion('Swampert', 'Electric')).toMatchObject({
      mult: 0,
      parts: [
        { type: 'Water', mult: 2 },
        { type: 'Ground', mult: 0 },
      ],
    });
    expect(makeQuestion('Gyarados', 'Electric').mult).toBe(4);
    expect(makeQuestion('Kingdra', 'Fire').mult).toBe(0.25);
  });

  it('follows the game’s chart: Steel stops resisting Ghost in Gen 6', () => {
    setActiveFormat('gen3ou');
    expect(makeQuestion('Skarmory', 'Ghost').mult).toBe(0.5);
    setActiveFormat('gen6ou');
    expect(makeQuestion('Skarmory', 'Ghost').mult).toBe(1);
  });

  it('skips a Pokémon whose ability changes the answer, and a matchup just asked', () => {
    setActiveFormat('gen3ou');
    const rng = makeRng(deriveSeed('trainer:skip', 0));
    const avoid = matchupKey('Water', ['Water']);
    for (let i = 0; i < 200; i++) {
      const q = nextQuestion({}, rng, avoid);
      expect(matchupKey(q.attack, q.types)).not.toBe(avoid);
      if (q.attack === 'Ground') expect(speciesInfo(q.species).abilities).not.toContain('Levitate');
    }
  });

  it('moves a matchup up a box when right, back to 1 when wrong', () => {
    setActiveFormat('gen3ou');
    const q = makeQuestion('Gyarados', 'Electric');
    const key = matchupKey('Electric', ['Water', 'Flying']);
    let boxes = answered({}, q, true);
    expect(boxes[key]).toBe(2);
    boxes = answered(boxes, q, true);
    expect(boxes[key]).toBe(3);
    expect(answered(boxes, q, false)[key]).toBe(1);
  });

  it('asks a missed matchup more often than a known one', () => {
    setActiveFormat('gen3ou');
    const rng = makeRng(deriveSeed('trainer:often', 0));
    // Every question so far known (box 5) except Electric on pure Water types.
    const missed = matchupKey('Electric', ['Water']);
    const known: Record<string, number> = {};
    let hits = 0;
    for (let i = 0; i < 300; i++) {
      const q = nextQuestion({ ...known, [missed]: 1 }, rng);
      const key = matchupKey(q.attack, q.types);
      if (key === missed) hits++;
      else known[key] = 5;
    }
    expect(hits).toBeGreaterThan(0);
  });
});
