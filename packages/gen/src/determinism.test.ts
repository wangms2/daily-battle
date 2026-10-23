import { readFileSync } from 'node:fs';
import { FORMATS, setsFor } from '@daily-battle/data';
import { describe, expect, it } from 'vitest';
import { GOLDEN_WEEKS, goldenFile } from './__fixtures__/golden-weeks';
import { GENERATOR_VERSION } from './config';
import { generateOpponent } from './opponent';
import { generatePool } from './pool';
import { generateWeek } from './week';

describe('determinism', () => {
  it('gives the same output for the same key, in any order', () => {
    const a = [generatePool('2026-10-19'), generateOpponent('2026-10-21')];
    generateOpponent('2026-11-03');
    generatePool('2027-02-01');
    const b = [generatePool('2026-10-19'), generateOpponent('2026-10-21')];
    expect(b).toEqual(a);
  });

  it('keeps candidate 0 on the plain key and draws alternatives for later candidates', () => {
    expect(generatePool('2026-10-19', undefined, 0)).toEqual(generatePool('2026-10-19'));
    expect(generateOpponent('2026-10-21', undefined, 0)).toEqual(generateOpponent('2026-10-21'));
    expect(generatePool('2026-10-19', undefined, 1).species).not.toEqual(
      generatePool('2026-10-19').species,
    );
    expect(generateOpponent('2026-10-21', undefined, 1).team).not.toEqual(
      generateOpponent('2026-10-21').team,
    );
  });

  it('gives different output for different keys', () => {
    expect(generatePool('2026-10-19').species).not.toEqual(generatePool('2026-10-26').species);
    expect(generateOpponent('2026-10-21').team).not.toEqual(generateOpponent('2026-10-22').team);
  });

  it.each(Object.keys(FORMATS))(
    'matches the %s golden file (bump GENERATOR_VERSION, or regenerate on purpose)',
    (format) => {
      // Regenerate with: pnpm --filter @daily-battle/gen golden --format <id>
      const data = setsFor(format);
      const path = new URL(`./__fixtures__/${goldenFile(format)}`, import.meta.url);
      const golden = JSON.parse(readFileSync(path, 'utf8')) as {
        generatorVersion: number;
        weeks: Record<string, unknown>;
      };
      expect(golden.generatorVersion).toBe(GENERATOR_VERSION);
      for (const week of GOLDEN_WEEKS) {
        expect(generateWeek(week, data), `week ${week}`).toEqual(golden.weeks[week]);
      }
    },
  );
});
