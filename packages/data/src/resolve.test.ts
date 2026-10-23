import { describe, expect, it } from 'vitest';
import { legalAbilities, pickMoves, resolveSet, usageShares } from './resolve';
import type { ChaosSpecies } from './types';

const stats: ChaosSpecies = {
  'Raw count': 100,
  usage: 0.1,
  Abilities: { levitate: 100 },
  Items: { leftovers: 60, choicescarf: 40 },
  Moves: { thunderbolt: 90, shadowball: 70, hydropump: 50, willowisp: 30, painsplit: 20 },
  Natures: { Timid: 70, Modest: 30 },
};
const usage = usageShares(stats);

describe('usageShares', () => {
  it('normalizes by total Pokémon count', () => {
    expect(usage.items.get('leftovers')).toBeCloseTo(0.6);
    expect(usage.moves.get('thunderbolt')).toBeCloseTo(0.9);
    expect(usage.natures.get('timid')).toBeCloseTo(0.7);
  });
});

describe('pickMoves', () => {
  it('picks the best combination, not the greedy one', () => {
    // Greedy would take Shadow Ball in slot 2, leaving Will-O-Wisp for slot 3.
    const slots = [
      ['Pain Split'],
      ['Shadow Ball', 'Hydro Pump'],
      ['Will-O-Wisp', 'Shadow Ball'],
      ['Thunderbolt'],
    ];
    expect(pickMoves(slots, usage.moves)).toEqual([
      'Pain Split',
      'Hydro Pump',
      'Shadow Ball',
      'Thunderbolt',
    ]);
  });

  it('returns null when slots force a repeat', () => {
    expect(pickMoves([['Thunderbolt'], ['Thunderbolt']], usage.moves)).toBeNull();
  });
});

describe('resolveSet', () => {
  it('resolves item, nature, and missing ability from usage', () => {
    const set = resolveSet(
      'Rotom-Wash',
      {
        moves: ['Thunderbolt', 'Shadow Ball', 'Pain Split', 'Will-O-Wisp'],
        item: ['Choice Scarf', 'Leftovers'],
        nature: ['Modest', 'Timid'],
        evs: { hp: 252, spa: 4, spe: 252 },
      },
      usage,
      4,
    );
    expect(set).toMatchObject({ item: 'Leftovers', nature: 'Timid', ability: 'Levitate' });
    expect(set?.evs).toEqual({ hp: 252, atk: 0, def: 0, spa: 4, spd: 0, spe: 252 });
    expect(set?.ivs.spe).toBe(31);
  });

  it('sets Hidden Power IVs', () => {
    const set = resolveSet(
      'Starmie',
      { moves: ['Surf', 'Hidden Power Fire', 'Recover', 'Rapid Spin'] },
      usage,
      4,
    );
    // Hidden Power Fire: Atk, SpA, and Spe IVs of 30.
    expect(set?.ivs).toMatchObject({ atk: 30, spa: 30, spe: 30 });
  });
});

describe('legalAbilities', () => {
  it('uses only abilities that exist in the generation', () => {
    expect(legalAbilities('Gengar', 4)).toEqual(['Levitate']);
  });

  it('allows hidden abilities from Gen 5 on', () => {
    expect(legalAbilities('Politoed', 4)).not.toContain('Drizzle');
    expect(legalAbilities('Politoed', 5)).toContain('Drizzle');
  });
});
