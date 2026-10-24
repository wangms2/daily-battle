import { describe, expect, it } from 'vitest';
import { FORMATS, genOf, type FormatId } from './formats';
import { setsFor } from './index';
import { buildSpecies } from './species';
import { megaCount, ONE_MEGA_MESSAGE, oneMegaProblem, speciesDataFor } from './species-data';

describe.each(Object.keys(FORMATS) as FormatId[])('%s/species.json', (format) => {
  const speciesData = speciesDataFor(format);

  it('is up to date with sets.json (run `pnpm build-species --format <id>` if this fails)', () => {
    expect(speciesData).toEqual(buildSpecies(setsFor(format)));
  });

  it("has the generation's type chart (Fairy arrives in Gen 6)", () => {
    const gen = genOf(format);
    expect(Object.keys(speciesData.typeChart)).toHaveLength(gen >= 6 ? 18 : 17);
    expect(speciesData.typeChart['Ground']!['Flying']).toBe(0);
    expect(speciesData.typeChart['Fire']!['Steel']).toBe(2);
    // Steel resists Ghost and Dark through Gen 5 only.
    expect(speciesData.typeChart['Ghost']!['Steel']).toBe(gen >= 6 ? 1 : 0.5);
    if (gen >= 6) {
      expect(speciesData.typeChart['Dragon']!['Fairy']).toBe(0);
      expect(speciesData.typeChart['Fairy']!['Dragon']).toBe(2);
    }
  });

  it('describes every item and ability the sets use', () => {
    for (const entry of Object.values(setsFor(format).species)) {
      for (const s of entry.sets) {
        if (s.item) expect(speciesData.items[s.item], s.item).toBeTruthy();
        expect(speciesData.abilities[s.ability], s.ability).toBeTruthy();
      }
    }
  });

  it("has the generation's typings (Rotom's forms took their own types in Gen 5, Gardevoir is pure Psychic before Fairy)", () => {
    const [species, expected] = (
      {
        gen3ou: ['Gardevoir', ['Psychic']],
        gen4ou: ['Rotom-Wash', ['Electric', 'Ghost']],
        gen5ou: ['Rotom-Wash', ['Electric', 'Water']],
        gen6ou: ['Rotom-Wash', ['Electric', 'Water']],
      } as const
    )[format];
    expect(speciesData.species[species]!.types).toEqual(expected);
  });

  it('has the Mega form of every set holding a Mega Stone, and none before Gen 6', () => {
    for (const [name, entry] of Object.entries(setsFor(format).species)) {
      const megas = speciesData.species[name]!.megas ?? {};
      for (const stone of Object.keys(megas)) {
        expect(entry.sets.some((s) => s.item === stone)).toBe(true);
        expect(speciesData.abilities[megas[stone]!.ability]).toBeTruthy();
      }
    }
    const all = Object.values(speciesData.species).filter((s) => s.megas);
    if (genOf(format) < 6) expect(all).toHaveLength(0);
    else expect(all.length).toBeGreaterThan(0);
  });
});

describe('gen6ou Megas', () => {
  const species = speciesDataFor('gen6ou').species;

  it('keeps the base form and adds the Mega form', () => {
    expect(species['Charizard']!.types).toEqual(['Fire', 'Flying']);
    expect(species['Charizard']!.megas!['Charizardite X']).toMatchObject({
      forme: 'Charizard-Mega-X',
      name: 'Mega Charizard X',
      types: ['Fire', 'Dragon'],
      ability: 'Tough Claws',
    });
  });

  it("plays a species at the higher of its own and its Mega's tier", () => {
    expect(species['Venusaur']!.tier).toBe('OU');
  });
});

describe('one Mega per team', () => {
  const team = (...items: [string, string][]) =>
    items.map(([species, item]) => ({ species, item }));

  it('counts sets that hold their own Mega Stone', () => {
    expect(
      megaCount('gen6ou', team(['Charizard', 'Charizardite X'], ['Garchomp', 'Leftovers'])),
    ).toBe(1);
    expect(megaCount('gen4ou', team(['Garchomp', 'Leftovers']))).toBe(0);
  });

  it('rejects two Mega Stones on one side', () => {
    expect(
      oneMegaProblem('gen6ou', team(['Charizard', 'Charizardite X'], ['Scizor', 'Scizorite'])),
    ).toBe(ONE_MEGA_MESSAGE);
    expect(
      oneMegaProblem('gen6ou', team(['Charizard', 'Charizardite Y'], ['Scizor', 'Choice Band'])),
    ).toBeNull();
  });
});
