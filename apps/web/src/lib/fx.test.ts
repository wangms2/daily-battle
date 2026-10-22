import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BACKGROUNDS, backgroundFor, HAZARD_FX, WEATHER_FX } from './fx';

const onDisk = (url: string) => existsSync(resolve(import.meta.dirname, '../../public', `.${url}`));

describe('fx', () => {
  it('picks the same background all day, and uses every one', () => {
    expect(backgroundFor('2026-10-21')).toBe(backgroundFor('2026-10-21'));
    const seen = new Set<string>();
    for (let d = 1; d <= 31; d++) seen.add(backgroundFor(`2026-10-${String(d).padStart(2, '0')}`));
    expect(seen.size).toBe(BACKGROUNDS.length);
  });

  it('ships every file it points at', () => {
    const urls = [
      ...BACKGROUNDS.map((b) => `/fx/${b}`),
      ...Object.values(WEATHER_FX),
      ...HAZARD_FX.rocks,
      HAZARD_FX.spikes,
      HAZARD_FX.toxicSpikes,
      HAZARD_FX.pokeball,
    ];
    for (const url of urls) expect(onDisk(url), url).toBe(true);
  });
});
