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
    // Greedy would take Shadow Ball in slot 1, leaving Will-O-Wisp for slot 2.
    const slots = [
      ['Pain Split'],
      ['Hydro Pump', 'Shadow Ball'],
      ['Shadow Ball', 'Will-O-Wisp'],
      ['Thunderbolt'],
    ];
    expect(pickMoves(slots, usage.moves)).toEqual([
      'Pain Split',
      'Hydro Pump',
      'Shadow Ball',
      'Thunderbolt',
    ]);
  });

  it("prefers a slot's first-listed option unless usage clearly beats it", () => {
    // Will-O-Wisp (0.3, doubled) beats Hydro Pump (0.5); Thunderbolt (0.9) beats Pain Split (0.2, doubled).
    expect(pickMoves([['Will-O-Wisp', 'Hydro Pump']], usage.moves)).toEqual(['Will-O-Wisp']);
    expect(pickMoves([['Pain Split', 'Thunderbolt']], usage.moves)).toEqual(['Thunderbolt']);
  });

  it('prefers the moves a reference uses', () => {
    // Will-O-Wisp is listed first (0.3, doubled) over Hydro Pump (0.5) until Hydro Pump is preferred too.
    const slots = [['Will-O-Wisp', 'Hydro Pump']];
    expect(pickMoves(slots, usage.moves)).toEqual(['Will-O-Wisp']);
    expect(pickMoves(slots, usage.moves, { preferred: new Set(['hydropump']) })).toEqual([
      'Hydro Pump',
    ]);
  });

  it('gives an attacker its attacks when the slots allow', () => {
    const isAttack = (m: string) => m !== 'Will-O-Wisp' && m !== 'Pain Split';
    const slots = [['Thunderbolt'], ['Will-O-Wisp', 'Hydro Pump']];
    expect(pickMoves(slots, usage.moves)).toEqual(['Thunderbolt', 'Will-O-Wisp']);
    expect(pickMoves(slots, usage.moves, { isAttack, minAttacks: 2 })).toEqual([
      'Thunderbolt',
      'Hydro Pump',
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

  it('gives a Choice set no status moves but Trick, and no Focus Punch', () => {
    const set = resolveSet(
      'Rotom-Wash',
      {
        moves: [
          ['Will-O-Wisp', 'Thunderbolt'],
          ['Focus Punch', 'Shadow Ball'],
          'Trick',
          'Hydro Pump',
        ],
        item: 'Choice Scarf',
        evs: { spa: 252, spe: 252 },
      },
      usage,
      4,
    );
    expect(set?.moves).toEqual(['Thunderbolt', 'Shadow Ball', 'Trick', 'Hydro Pump']);
  });

  it('skips a listed nature that lowers a stat the set invests in', () => {
    const set = resolveSet(
      'Rotom-Wash',
      { moves: ['Thunderbolt'], nature: ['Jolly', 'Timid'], evs: { spa: 252, spe: 252 } },
      {
        ...usage,
        natures: new Map([
          ['jolly', 0.9],
          ['timid', 0.1],
        ]),
      },
      4,
    );
    expect(set?.nature).toBe('Timid');
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
