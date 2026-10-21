import { describe, expect, it } from 'vitest';
import { sets } from './index';
import { buildSpecies } from './species';
import { speciesData } from './species-data';

describe('gen4ou/species.json', () => {
  it('is up to date with sets.json (run `pnpm build-species` if this fails)', () => {
    expect(speciesData).toEqual(buildSpecies(sets));
  });

  it('has Gen 4 typings and a 17-type chart', () => {
    expect(speciesData.species['Rotom-Wash']!.types).toEqual(['Electric', 'Ghost']);
    expect(Object.keys(speciesData.typeChart)).toHaveLength(17);
    expect(speciesData.typeChart['Ground']!['Flying']).toBe(0);
    expect(speciesData.typeChart['Fire']!['Steel']).toBe(2);
  });
});
