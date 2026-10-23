import { describe, expect, it } from 'vitest';
import { FORMATS, type FormatId } from './formats';
import { setsFor } from './index';
import { buildSpecies } from './species';
import { speciesDataFor } from './species-data';

describe.each(Object.keys(FORMATS) as FormatId[])('%s/species.json', (format) => {
  const speciesData = speciesDataFor(format);

  it('is up to date with sets.json (run `pnpm build-species --format <id>` if this fails)', () => {
    expect(speciesData).toEqual(buildSpecies(setsFor(format)));
  });

  it('has a 17-type chart (Fairy arrives in Gen 6)', () => {
    expect(Object.keys(speciesData.typeChart)).toHaveLength(17);
    expect(speciesData.typeChart['Ground']!['Flying']).toBe(0);
    expect(speciesData.typeChart['Fire']!['Steel']).toBe(2);
    // Steel still resists Ghost and Dark through Gen 5.
    expect(speciesData.typeChart['Ghost']!['Steel']).toBe(0.5);
  });

  it('describes every item and ability the sets use', () => {
    for (const entry of Object.values(setsFor(format).species)) {
      for (const s of entry.sets) {
        if (s.item) expect(speciesData.items[s.item], s.item).toBeTruthy();
        expect(speciesData.abilities[s.ability], s.ability).toBeTruthy();
      }
    }
  });

  it("has the generation's typings (Rotom's forms took their own types in Gen 5)", () => {
    const expected = { gen4ou: ['Electric', 'Ghost'], gen5ou: ['Electric', 'Water'] }[format];
    expect(speciesData.species['Rotom-Wash']!.types).toEqual(expected);
  });
});
