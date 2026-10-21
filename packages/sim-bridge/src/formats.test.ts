import { Dex, Teams, TeamValidator } from '@pkmn/sim';
import { describe, expect, it } from 'vitest';
import { SAMPLE_TEAM_A, SAMPLE_TEAM_B } from './teams';

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
