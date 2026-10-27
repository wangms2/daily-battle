import { setsFor } from '@daily-battle/data';
import { checklist, findSet, generatePool, setChecks } from '@daily-battle/gen';
import { afterAll, describe, expect, it } from 'vitest';
import { PIPELINE } from './config';
import { defenseHoles, recommendTeam } from './recommend';
import { legalTeam } from './sample';
import { Simulator } from './simulate';

const sim = new Simulator(0);
afterAll(() => sim.close());

// A tiny search so the test stays quick; the rules are the same as the real one's.
const small = {
  ...PIPELINE.recommend,
  searchProbes: 2,
  finalProbes: 2,
  startTeams: 4,
  screenSeeds: 1,
  rounds: 1,
  tweaks: 2,
  retestTop: 2,
  retestSeeds: 1,
  finalists: 1,
  finalSeeds: 1,
};

describe('recommended team', () => {
  const data = setsFor('gen3ou');
  const week = '2026-10-26';
  const species = generatePool(week, data, 0).species;

  it('meets the rules, uses common sets, and is the same every run', async () => {
    const rec = (await recommendTeam(week, species, sim, data, small))!;
    expect(rec.rules).toBe('all');
    expect(legalTeam(data, rec.team)).toBe(true);
    expect(rec.team.every((s) => species.includes(s.species))).toBe(true);
    const teamSets = rec.team.map((s) => findSet(data, s));
    expect(teamSets.every((s) => s.weight >= small.minSetWeight)).toBe(true);
    expect(defenseHoles(data, rec.team)).toEqual([]);
    const checks = checklist(teamSets);
    for (const key of Object.keys(checks) as (keyof typeof checks)[]) {
      const poolHas = species.some((sp) =>
        data.species[sp]!.sets.some((s) => s.weight >= small.minSetWeight && setChecks(s)[key]),
      );
      if (poolHas) expect(checks[key], key).toBe(true);
    }
    expect((await recommendTeam(week, species, sim, data, small))!.team).toEqual(rec.team);
  }, 120_000);
});
