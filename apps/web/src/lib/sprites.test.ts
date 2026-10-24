import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { FORMATS, setsFor } from '@daily-battle/data';
import { describe, expect, it } from 'vitest';
import { setActiveFormat } from './data';
import { getSprite } from './sprites';

const onDisk = (url: string) => existsSync(resolve(import.meta.dirname, '../../public', `.${url}`));

describe('sprites', () => {
  it.each(Object.keys(FORMATS))(
    'ships front, back, and icon art (animated and still) for every %s species',
    (f) => {
      const missing = Object.keys(setsFor(f).species).flatMap((species) =>
        (['front', 'back', 'icon'] as const)
          .flatMap((kind) => [getSprite(species, kind), getSprite(species, kind, 'still')])
          .filter((url) => !onDisk(url)),
      );
      // Run `pnpm --filter web sprites` to download any that are missing.
      expect(missing).toEqual([]);
    },
  );

  it('uses the Emerald sprites in Gen 3, and the shared ones elsewhere', () => {
    try {
      setActiveFormat('gen3ou');
      expect(getSprite('Skarmory')).toMatch(/\/sprites\/gen3\/front\/skarmory\.png$/);
      expect(getSprite('Skarmory', 'back')).toMatch(/\/sprites\/gen3\/back\/skarmory\.png$/);
      expect(getSprite('Skarmory', 'icon')).toMatch(/\/sprites\/icons\/skarmory\.png$/);
      expect(getSprite('Substitute')).toMatch(/\/sprites\/front\/substitute\.gif$/);
      const missing = Object.keys(setsFor('gen3ou').species)
        .flatMap((species) => [getSprite(species), getSprite(species, 'back')])
        .filter((url) => !onDisk(url));
      expect(missing).toEqual([]);
      setActiveFormat('gen4ou');
      expect(getSprite('Skarmory')).toMatch(/\/sprites\/front\/skarmory\.gif$/);
    } finally {
      setActiveFormat('gen4ou');
    }
  });
});
