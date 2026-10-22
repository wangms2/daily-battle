import { sets } from '@daily-battle/data';
import { findSet, rngFor } from '@daily-battle/gen';
import { describe, expect, it } from 'vitest';
import { archetypeTeams, fitsArchetype, setRole } from './archetypes';

const role = (species: string, sourceName: string) =>
  setRole(sets.species[species]!.sets.find((s) => s.sourceName === sourceName)!);

describe('set roles', () => {
  it('calls choice, Life Orb, sash and setup sweepers attackers, however bulky', () => {
    expect(role('Tyranitar', 'Choice Scarf')).toBe('attacker');
    expect(role('Arcanine', 'Life Orb')).toBe('attacker');
    expect(role('Azelf', 'Standard Lead')).toBe('attacker');
    expect(role('Lucario', sets.species.Lucario!.sets[0]!.sourceName)).toBe('attacker');
    expect(role('Scizor', 'Bulky Swords Dance')).toBe('attacker');
  });

  it('calls bulky recovery, status and phazing sets walls', () => {
    expect(role('Milotic', 'Physically Defensive')).toBe('wall');
    expect(role('Zapdos', 'Specially Defensive')).toBe('wall');
    expect(role('Swampert', 'Tank')).toBe('wall');
    expect(role('Suicune', 'CroCune (Defensive Calm Mind + RestTalk)')).toBe('wall');
  });
});

describe('archetype teams', () => {
  // The week of 2026-10-19's published pool, which fields all three.
  const pool = [
    'Lucario',
    'Roserade',
    'Heatran',
    'Celebi',
    'Scizor',
    'Jirachi',
    'Hippowdon',
    'Tyranitar',
    'Suicune',
    'Azelf',
    'Clefable',
    'Rhyperior',
  ];

  it('builds each archetype to its rules', () => {
    for (const archetype of ['Offense', 'Balanced', 'Stall'] as const) {
      const teams = archetypeTeams(pool, archetype, 8, rngFor(`test:${archetype}`), sets);
      expect(teams.length, archetype).toBeGreaterThan(0);
      for (const team of teams) {
        const roles = team.map((slot) => setRole(findSet(sets, slot)));
        expect(
          fitsArchetype(
            team.map((slot) => findSet(sets, slot)),
            archetype,
          ),
        ).toBe(true);
        if (archetype === 'Stall') expect(roles).not.toContain('attacker');
        if (archetype === 'Offense') expect(roles).not.toContain('wall');
        if (archetype === 'Balanced') {
          expect(roles.filter((r) => r === 'attacker').length).toBeGreaterThanOrEqual(2);
          expect(roles.filter((r) => r === 'wall').length).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });

  it('offers none when the pool cannot field the archetype', () => {
    const attackersOnly = ['Infernape', 'Jolteon', 'Electivire', 'Gengar', 'Starmie', 'Azelf'];
    expect(archetypeTeams(attackersOnly, 'Stall', 4, rngFor('t'), sets)).toEqual([]);
  });
});
