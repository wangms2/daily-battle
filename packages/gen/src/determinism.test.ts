import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GOLDEN_WEEKS } from './__fixtures__/golden-weeks';
import { GENERATOR_VERSION } from './config';
import { generateOpponent } from './opponent';
import { generatePool } from './pool';
import { generateWeek } from './week';

const goldenPath = new URL('./__fixtures__/golden.json', import.meta.url);

describe('determinism', () => {
  it('gives the same output for the same key, in any order', () => {
    const a = [generatePool('2026-10-19'), generateOpponent('2026-10-21')];
    generateOpponent('2026-11-03');
    generatePool('2027-02-01');
    const b = [generatePool('2026-10-19'), generateOpponent('2026-10-21')];
    expect(b).toEqual(a);
  });

  it('gives different output for different keys', () => {
    expect(generatePool('2026-10-19').species).not.toEqual(generatePool('2026-10-26').species);
    expect(generateOpponent('2026-10-21').team).not.toEqual(generateOpponent('2026-10-22').team);
  });

  it('matches the golden file (bump GENERATOR_VERSION, or regenerate on purpose)', () => {
    // Regenerate with: pnpm --filter @daily-battle/gen golden
    const golden = JSON.parse(readFileSync(goldenPath, 'utf8')) as {
      generatorVersion: number;
      weeks: Record<string, unknown>;
    };
    expect(golden.generatorVersion).toBe(GENERATOR_VERSION);
    for (const week of GOLDEN_WEEKS) {
      expect(generateWeek(week), `week ${week}`).toEqual(golden.weeks[week]);
    }
  });
});
