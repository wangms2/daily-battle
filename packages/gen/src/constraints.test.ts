import { sets } from '@daily-battle/data';
import { describe, expect, it } from 'vitest';
import { addDays } from './dates';
import { generateOpponent } from './opponent';
import { generatePool } from './pool';
import { majorOffensiveTypes } from './traits';
import { verifyOpponent, verifyPool } from './verify';

// CI runs `scripts/check.ts` over 10,000 seeds; this keeps the unit run fast.
const N = 1000;
const START = '2026-01-05'; // a Monday

describe('generated content meets its constraints', () => {
  const majorTypes = majorOffensiveTypes(sets);

  it(`pools for ${N} weeks`, () => {
    const failures: string[] = [];
    for (let i = 0; i < N; i++) {
      const pool = generatePool(addDays(START, 7 * i));
      const problems = verifyPool(pool, sets, majorTypes);
      if (problems.length) failures.push(`${pool.week}: ${problems.join(', ')}`);
    }
    expect(failures).toEqual([]);
  }, 120_000);

  it(`opponents for ${N} days`, () => {
    const failures: string[] = [];
    for (let i = 0; i < N; i++) {
      const opponent = generateOpponent(addDays(START, i));
      const problems = verifyOpponent(opponent, sets);
      if (problems.length) failures.push(`${opponent.day}: ${problems.join(', ')}`);
    }
    expect(failures).toEqual([]);
  }, 120_000);

  it('usually includes a hazard remover, but not always', () => {
    let withRemover = 0;
    for (let i = 0; i < 300; i++) {
      const { team } = generateOpponent(addDays(START, i));
      const removes = team.some((slot) =>
        sets.species[slot.species]!.sets.find((s) => s.id === slot.setId)!.moves.some((m) =>
          ['Rapid Spin', 'Defog'].includes(m),
        ),
      );
      if (removes) withRemover++;
    }
    expect(withRemover).toBeGreaterThan(0);
    expect(withRemover).toBeLessThan(300);
  });
});
