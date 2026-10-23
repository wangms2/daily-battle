import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { FORMATS, setsFor } from '@daily-battle/data';
import { describe, expect, it } from 'vitest';
import { itemSlug } from './items';

describe('item icons', () => {
  it('names files by a slug of the item', () => {
    expect(itemSlug('Choice Scarf')).toBe('choice-scarf');
    expect(itemSlug("King's Rock")).toBe('kings-rock');
    expect(itemSlug('Life Orb')).toBe('life-orb');
  });

  it('ships an icon for every item any set holds', () => {
    const root = resolve(import.meta.dirname, '../../public/items');
    const missing = new Set<string>();
    for (const id of Object.keys(FORMATS))
      for (const entry of Object.values(setsFor(id).species))
        for (const set of entry.sets)
          if (set.item && !existsSync(`${root}/${itemSlug(set.item)}.png`)) missing.add(set.item);
    expect([...missing]).toEqual([]);
  });
});
