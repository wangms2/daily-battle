import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { FORMATS, setsFor } from '@daily-battle/data';
import { describe, expect, it } from 'vitest';
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
});
