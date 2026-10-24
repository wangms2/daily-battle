import { describe, expect, it } from 'vitest';
import { assignRoles, deriveRole } from './roles';

type RoleInput = Parameters<typeof deriveRole>[0];

const set = (overrides: Partial<RoleInput> = {}): RoleInput => ({
  species: 'Test',
  sourceName: 'Source Name',
  moves: ['Tackle', 'Ember', 'Bubble', 'Thunder Shock'],
  item: 'Leftovers',
  ability: 'Pressure',
  nature: 'Serious',
  evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
  ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
  ...overrides,
});

const PHYS_BULK = { hp: 252, atk: 0, def: 252, spa: 0, spd: 4, spe: 0 };
const SPEC_BULK = { hp: 252, atk: 0, def: 4, spa: 0, spd: 252, spe: 0 };

describe('deriveRole', () => {
  it.each<[Partial<RoleInput>, string]>([
    [{ item: 'Choice Scarf' }, 'Choice Scarf attacker'],
    [
      { item: 'Focus Sash', moves: ['Stealth Rock', 'Taunt', 'Explosion', 'Fire Blast'] },
      'Stealth Rock lead',
    ],
    [{ moves: ['Dragon Dance', 'Waterfall', 'Earthquake', 'Stone Edge'] }, 'Dragon Dance sweeper'],
    [{ moves: ['Spikes', 'Roost', 'Whirlwind', 'Brave Bird'] }, 'Spikes setter'],
    [{ moves: ['Spikes', 'Toxic Spikes', 'Rapid Spin', 'Payback'] }, 'Hazard setter'],
    [{ evs: PHYS_BULK }, 'Physical wall'],
    [{ evs: SPEC_BULK }, 'Special wall'],
    [{ evs: { hp: 0, atk: 128, def: 0, spa: 128, spd: 0, spe: 252 } }, 'Mixed attacker'],
    [{}, 'Source Name'],
  ])('%o → %s', (overrides, label) => {
    expect(deriveRole(set(overrides)).label).toBe(label);
  });

  it('mentions Rapid Spin on a hazard setter that also spins', () => {
    const role = deriveRole(set({ moves: ['Spikes', 'Rapid Spin', 'Payback', 'Gyro Ball'] }));
    expect(role.description).toContain('Rapid Spin');
  });

  it('drops parentheticals from fallback labels', () => {
    expect(deriveRole(set({ sourceName: 'TyraniBoah (SubPunch)' })).label).toBe('TyraniBoah');
  });
});

describe('deriveRole in Gen 6', () => {
  it.each<[Partial<RoleInput>, string]>([
    [{ item: 'Assault Vest' }, 'Assault Vest tank'],
    [{ item: 'Weakness Policy' }, 'Weakness Policy attacker'],
    [{ moves: ['Sticky Web', 'Taunt', 'Ember', 'Bubble'] }, 'Sticky Web setter'],
    [{ moves: ['Defog', 'Roost', 'Ember', 'Bubble'] }, 'Defogger'],
    [{ moves: ['Parting Shot', 'Taunt', 'Ember', 'Bubble'] }, 'Pivot'],
    [
      {
        species: 'Charizard',
        item: 'Charizardite X',
        moves: ['Dragon Dance', 'Flare Blitz', 'Dragon Claw', 'Roost'],
      },
      'Mega X Dragon Dance sweeper',
    ],
    [
      {
        species: 'Lopunny',
        item: 'Lopunnite',
        evs: { hp: 0, atk: 252, def: 4, spa: 0, spd: 0, spe: 252 },
      },
      'Mega fast attacker',
    ],
  ])('%o → %s', (overrides, label) => {
    expect(deriveRole(set(overrides), 6).label).toBe(label);
  });

  it('keeps Gen 4–5 labels for moves that only gained a role in Gen 6', () => {
    expect(deriveRole(set({ moves: ['Defog', 'Roost', 'Ember', 'Bubble'] }), 5).label).toBe(
      'Source Name',
    );
  });

  it('says how long ability weather lasts in each generation', () => {
    const politoed = set({ ability: 'Drizzle' });
    expect(deriveRole(politoed, 5).description).toContain('until another weather');
    expect(deriveRole(politoed, 6).description).toContain('five turns (eight with Damp Rock)');
  });

  it("names the Mega a set's stone makes", () => {
    const role = deriveRole(set({ species: 'Charizard', item: 'Charizardite Y' }), 6);
    expect(role.description).toContain('Mega Charizard Y');
  });
});

describe('assignRoles', () => {
  it('tells apart shared labels by item when items differ', () => {
    const moves = ['Swords Dance', 'Bullet Punch', 'Bug Bite', 'Superpower'];
    const roles = assignRoles([
      { ...set({ moves, item: 'Leftovers' }), id: 'a' },
      { ...set({ moves, item: 'Life Orb' }), id: 'b' },
    ]);
    expect(roles.map((r) => r.label)).toEqual([
      'Swords Dance sweeper (Leftovers)',
      'Swords Dance sweeper (Life Orb)',
    ]);
  });

  it('falls back to the spread when items match', () => {
    const moves = ['Stealth Rock', 'Slack Off', 'Earthquake', 'Roar'];
    const roles = assignRoles([
      { ...set({ moves, evs: PHYS_BULK }), id: 'a' },
      { ...set({ moves, evs: SPEC_BULK }), id: 'b' },
    ]);
    expect(roles.map((r) => r.label)).toEqual([
      'Stealth Rock setter (physically defensive)',
      'Stealth Rock setter (specially defensive)',
    ]);
  });

  it('applies overrides by id', () => {
    const roles = assignRoles([{ ...set(), id: 'x' }], { x: { label: 'Custom' } });
    expect(roles[0]).toEqual({ label: 'Custom', description: expect.any(String) });
  });
});
