import { TeamValidator } from '@pkmn/sim';
import { describe, expect, it } from 'vitest';
import { FORMATS, type FormatId } from './formats';
import { coresFor, setsFor } from './index';
import { oneMegaProblem } from './species-data';

describe.each(Object.keys(FORMATS) as FormatId[])('%s/cores.json', (format) => {
  const cores = coresFor(format);
  const data = setsFor(format);
  const top = (species: string) =>
    data.species[species]!.sets.reduce((a, b) => (b.weight > a.weight ? b : a));

  it('has both offensive and defensive cores, with unique ids', () => {
    expect(new Set(cores.map((c) => c.id)).size).toBe(cores.length);
    expect(cores.some((c) => c.kind === 'offensive')).toBe(true);
    expect(cores.some((c) => c.kind === 'defensive')).toBe(true);
  });

  it.each(cores.map((c) => [c.id, c] as const))('%s is well-formed', (_id, core) => {
    expect(core.members.length).toBeGreaterThanOrEqual(2);
    expect(core.members.length).toBeLessThanOrEqual(3);
    expect(new Set(core.members).size).toBe(core.members.length);
    expect(core.name).toBe(core.members.join(' + '));
    expect(core.id).toBe(
      core.members
        .join('-')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-'),
    );
    expect(['offensive', 'defensive']).toContain(core.kind);
    expect(core.why.length).toBeGreaterThan(0);
    expect(core.why.length).toBeLessThanOrEqual(90);
    for (const member of core.members) expect(data.species[member], member).toBeDefined();
  });

  it("is legal together on every member's most used set", () => {
    // "Add core" gives each member its most used set, so that team must always be legal.
    const validator = TeamValidator.get(format);
    const problems = cores.flatMap((core) => {
      const team = core.members.map((species) => ({
        name: species,
        species,
        gender: '',
        level: 100,
        ...structuredClone(top(species)),
      }));
      const errors = [validator.validateTeam(team), oneMegaProblem(format, team as never)]
        .flat()
        .filter(Boolean);
      return errors.length ? [`${core.id}: ${errors.join(' ')}`] : [];
    });
    expect(problems).toEqual([]);
  });
});
