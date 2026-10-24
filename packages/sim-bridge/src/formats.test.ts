import { Dex, Teams, TeamValidator } from '@pkmn/sim';
import { describe, expect, it } from 'vitest';
import { SAMPLE_TEAM_A, SAMPLE_TEAM_B } from './fixtures';
import { teamProblems } from './teams';

function validate(exported: string) {
  const team = Teams.import(exported);
  if (!team) throw new Error('Could not parse team');
  return TeamValidator.get('gen4ou').validateTeam(team);
}

describe('gen4ou format', () => {
  it('is bundled in @pkmn/sim', () => {
    const format = Dex.formats.get('gen4ou');
    expect(format.exists).toBe(true);
    expect(format.mod).toBe('gen4');
  });

  it.each([
    ['A', SAMPLE_TEAM_A],
    ['B', SAMPLE_TEAM_B],
  ])('accepts sample team %s', (_name, team) => {
    expect(validate(team)).toBeNull();
  });

  it('rejects an Uber', () => {
    const team = SAMPLE_TEAM_A.replace(
      /Jirachi @ Choice Scarf[\s\S]*?- Trick/,
      `Darkrai @ Life Orb
Ability: Bad Dreams
EVs: 252 SpA / 4 SpD / 252 Spe
Timid Nature
- Dark Void
- Dark Pulse
- Focus Blast
- Nasty Plot`,
    );
    expect(validate(team)?.join('\n')).toMatch(/Darkrai/);
  });

  it('rejects a banned move', () => {
    const team = SAMPLE_TEAM_A.replace('- Pain Split', '- Swagger');
    expect(validate(team)?.join('\n')).toMatch(/Swagger/);
  });
});

describe('gen3ou format', () => {
  const mon = (species: string, ability: string, moves: string[]) => ({
    name: species,
    species,
    item: 'Leftovers',
    ability,
    moves,
    nature: 'Hardy',
    evs: { hp: 4, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    level: 100,
    gender: '',
  });
  const validateGen3 = (team: ReturnType<typeof mon>[]) =>
    TeamValidator.get('gen3ou').validateTeam(structuredClone(team));

  it('is bundled in @pkmn/sim without Team Preview, with the ADV bans and clauses', () => {
    const format = Dex.formats.get('gen3ou');
    expect(format.exists).toBe(true);
    expect(format.mod).toBe('gen3');
    expect(format.ruleset).not.toContain('Team Preview');
    expect(format.ruleset).toEqual(expect.arrayContaining(['One Boost Passer Clause']));
    expect(format.banlist).toEqual(expect.arrayContaining(['Swagger', 'Soundproof', 'Sand Veil']));
  });

  it('rejects an Uber and accepts an OU team', () => {
    expect(validateGen3([mon('Latios', 'Levitate', ['Calm Mind', 'Psychic'])])?.join('\n')).toMatch(
      /Latios/,
    );
    expect(
      validateGen3([
        mon('Skarmory', 'Keen Eye', ['Spikes', 'Roar']),
        mon('Blissey', 'Natural Cure', ['Soft-Boiled', 'Ice Beam']),
      ]),
    ).toBeNull();
  });

  it('allows one Baton Passer that boosts per team, not two', () => {
    const celebi = mon('Celebi', 'Natural Cure', ['Calm Mind', 'Baton Pass']);
    const umbreon = mon('Umbreon', 'Synchronize', ['Curse', 'Baton Pass']);
    expect(validateGen3([celebi])).toBeNull();
    expect(validateGen3([celebi, umbreon])?.join('\n')).toMatch(/One Boost Passer/);
  });
});

describe('gen6ou format', () => {
  it('is bundled in @pkmn/sim with Team Preview and the OU bans', () => {
    const format = Dex.formats.get('gen6ou');
    expect(format.exists).toBe(true);
    expect(format.mod).toBe('gen6');
    expect(format.banlist).toEqual(
      expect.arrayContaining(['Baton Pass', 'Swagger', "King's Rock", 'Arena Trap', 'Shadow Tag']),
    );
  });

  it('rejects an Uber Mega', () => {
    const team = Teams.import(`Mawile @ Mawilite
Ability: Intimidate
EVs: 252 HP / 252 Atk / 4 SpD
Adamant Nature
- Play Rough
- Iron Head
- Sucker Punch
- Swords Dance`)!;
    expect(TeamValidator.get('gen6ou').validateTeam(team)?.join('\n')).toMatch(/Mawile/);
  });

  it("lets two Mega Stones through the sim's validator, so the one-Mega rule is ours", () => {
    const two = [
      {
        species: 'Charizard',
        item: 'Charizardite X',
        moves: ['Dragon Dance', 'Flare Blitz', 'Dragon Claw', 'Roost'],
      },
      {
        species: 'Scizor',
        item: 'Scizorite',
        moves: ['Swords Dance', 'Bullet Punch', 'U-turn', 'Roost'],
      },
    ].map((s) => ({
      ...s,
      name: s.species,
      ability: s.species === 'Charizard' ? 'Blaze' : 'Technician',
      nature: 'Adamant',
      evs: { hp: 0, atk: 252, def: 0, spa: 0, spd: 4, spe: 252 },
      ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
      level: 100,
      gender: '',
    }));
    expect(TeamValidator.get('gen6ou').validateTeam(structuredClone(two))).toBeNull();
    expect(teamProblems('gen6ou', two)).toEqual(['Only one Mega per team.']);
    expect(teamProblems('gen6ou', [two[0]!])).toBeNull();
  });
});
