import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BACKGROUNDS, backgroundFor, HAZARD_FX, WEATHER_FX } from './fx';

const onDisk = (url: string) => existsSync(resolve(import.meta.dirname, '../../public', `.${url}`));

describe('fx', () => {
  it.each(Object.keys(BACKGROUNDS))(
    'picks the same %s background all day, and uses every one',
    (format) => {
      expect(backgroundFor('2026-10-21', format)).toBe(backgroundFor('2026-10-21', format));
      const seen = new Set<string>();
      for (let d = 0; d < 120; d++) {
        const day = new Date(Date.UTC(2026, 9, 1 + d)).toISOString().slice(0, 10);
        seen.add(backgroundFor(day, format));
      }
      expect(seen.size).toBe(BACKGROUNDS[format]!.length);
    },
  );

  it('keeps Gen 4 OU on the backgrounds it had', () => {
    expect(backgroundFor('2026-10-21')).toBe(backgroundFor('2026-10-21', 'gen4ou'));
    expect(backgroundFor('2026-10-21')).toMatch(/bg-gen4/);
  });

  it('ships every file it points at', () => {
    const urls = [
      ...Object.values(BACKGROUNDS).flatMap((list) => list.map((b) => `/fx/${b}`)),
      ...Object.values(WEATHER_FX),
      ...HAZARD_FX.rocks,
      HAZARD_FX.spikes,
      HAZARD_FX.toxicSpikes,
      HAZARD_FX.pokeball,
    ];
    for (const url of urls) expect(onDisk(url), url).toBe(true);
  });
});
