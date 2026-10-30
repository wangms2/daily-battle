import { describe, expect, it } from 'vitest';
import { solve, type WorldTable } from './matrix';

const table = (ours: string[], value: number[][], weight = 1): WorldTable => ({
  weight,
  ours,
  theirs: value[0]!.map((_, j) => `move:${j}`),
  value,
});

describe('solve', () => {
  it('mixes evenly in rock-paper-scissors', () => {
    const rps = table(
      ['r', 'p', 's'],
      [
        [0.5, 0, 1],
        [1, 0.5, 0],
        [0, 1, 0.5],
      ],
    );
    const { mix, value } = solve([rps], 5000);
    for (const p of mix) expect(p).toBeCloseTo(1 / 3, 1);
    expect(value).toBeCloseTo(0.5, 1);
  });

  it('drops a dominated option and plays the safe one against a foe who knows its world', () => {
    // "read" wins big in world A only; "safe" is solid in both. The foe in B
    // punishes the read.
    const a = table(
      ['read', 'safe', 'bad'],
      [
        [1, 0.9],
        [0.6, 0.6],
        [0.1, 0.1],
      ],
    );
    const b = table(
      ['read', 'safe'],
      [
        [0.1, 0.2],
        [0.6, 0.6],
      ],
    );
    const { ours, mix } = solve([a, b], 5000);
    expect(mix[ours.indexOf('bad')]).toBeLessThan(0.02);
    expect(mix[ours.indexOf('safe')]).toBeGreaterThan(0.9);
  });
});
