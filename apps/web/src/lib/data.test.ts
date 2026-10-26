import { describe, expect, it } from 'vitest';
import {
  likelyMoves,
  abilityInfo,
  defenseGaps,
  findSet,
  itemInfo,
  offenseGaps,
  possibleSets,
  sameSpecies,
  setsOf,
} from './data';

// Gen 4 OU, the default active format.
const labels = (species: string, revealed?: Parameters<typeof possibleSets>[1]) =>
  possibleSets(species, revealed).map((s) => s.label);

describe('likelyMoves', () => {
  const sets = [
    { moves: ['Rock Slide', 'Earthquake', 'Dragon Dance', 'Hidden Power Bug'], weight: 0.6 },
    { moves: ['Rock Slide', 'Earthquake', 'Focus Punch', 'Crunch'], weight: 0.3 },
    { moves: ['Pursuit', 'Crunch', 'Fire Blast', 'Brick Break'], weight: 0.1 },
  ];
  it('lists the moves not shown yet, most common across the sets first', () => {
    expect(likelyMoves(sets, ['Rock Slide'])).toEqual([
      'Earthquake',
      'Dragon Dance',
      'Hidden Power Bug',
      'Crunch',
    ]);
  });
  it('counts a shown Hidden Power of any type as shown', () => {
    expect(likelyMoves(sets, ['Rock Slide', 'Earthquake', 'Hidden Power'])).not.toContain(
      'Hidden Power Bug',
    );
  });
});

describe('possibleSets', () => {
  it('lists every set until the foe shows something', () => {
    expect(labels('Heatran')).toEqual(setsOf('Heatran').map((s) => s.label));
  });

  it('narrows on revealed moves, item, and ability', () => {
    expect(labels('Heatran', { moves: ['Magma Storm'], item: '', ability: '' })).toEqual([
      'Fast attacker',
    ]);
    expect(labels('Heatran', { moves: ['Stealth Rock'], item: '', ability: '' })).toEqual([
      'Stealth Rock setter',
      'Choice Scarf attacker',
    ]);
    expect(labels('Heatran', { moves: ['Stealth Rock'], item: 'Leftovers', ability: '' })).toEqual([
      'Stealth Rock setter',
    ]);
  });

  it('stops counting the item when nothing fits it (it may have been Tricked)', () => {
    const tricked = { moves: ['Magma Storm'], item: 'Choice Scarf', ability: '' };
    expect(labels('Heatran', tricked)).toEqual(['Fast attacker']);
  });
});

describe('coverage', () => {
  it('finds types no attack on the team hits super effectively', () => {
    // Choice Band Scizor: Bug, Steel, Fighting, and Dark attacks.
    const scizor = findSet({ species: 'Scizor', setId: 'scizor-choice-band' })!;
    const gaps = offenseGaps([scizor]);
    expect(gaps).toEqual(expect.arrayContaining(['Water', 'Fire', 'Fighting']));
    expect(gaps).not.toContain('Grass'); // U-turn
    expect(gaps).not.toContain('Steel'); // Superpower
  });

  it('flags a type three of the team are weak to, unless someone resists it', () => {
    const weakToGround = ['Heatran', 'Magnezone', 'Tyranitar'];
    expect(defenseGaps(weakToGround).map((g) => g.type)).toContain('Ground');
    // Gengar is Ground-weak by type, but Levitate makes it immune: Ground is covered.
    expect(defenseGaps([...weakToGround, 'Gengar']).map((g) => g.type)).not.toContain('Ground');
  });
});

describe('species facts', () => {
  it('describes items and abilities', () => {
    expect(itemInfo('Leftovers')).toMatch(/restores 1\/16/);
    expect(abilityInfo('Levitate')).toMatch(/Ground/);
    expect(itemInfo('Not An Item')).toBeUndefined();
  });

  it('treats forms of one Pokémon as the same species', () => {
    expect(sameSpecies('Rotom-Wash', 'Rotom-Frost')).toBe(true);
    expect(sameSpecies('Rotom-Wash', 'Gengar')).toBe(false);
  });
});
