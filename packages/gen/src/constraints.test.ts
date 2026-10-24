import { FORMATS, setsFor, type FormatId } from '@daily-battle/data';
import { Dex, TeamValidator } from '@pkmn/sim';
import { describe, expect, it } from 'vitest';
import { addDays } from './dates';
import { generateOpponent } from './opponent';
import { generatePool } from './pool';
import { rngFor } from './rng';
import { toPokemonSet } from './sets';
import { majorOffensiveTypes } from './traits';
import { verifyOpponent, verifyPool } from './verify';

// CI runs `scripts/check.ts` over 10,000 seeds; this keeps the unit run fast.
const N = 1000;
const START = '2026-01-05'; // a Monday

describe.each(Object.keys(FORMATS) as FormatId[])('generated %s content', (format) => {
  const sets = setsFor(format);
  const majorTypes = majorOffensiveTypes(sets);

  it(`meets its constraints: pools for ${N} weeks`, () => {
    const failures: string[] = [];
    for (let i = 0; i < N; i++) {
      const pool = generatePool(addDays(START, 7 * i), sets);
      const problems = verifyPool(pool, sets, majorTypes);
      if (problems.length) failures.push(`${pool.week}: ${problems.join(', ')}`);
    }
    expect(failures).toEqual([]);
  }, 120_000);

  it(`meets its constraints: opponents for ${N} days`, () => {
    const failures: string[] = [];
    for (let i = 0; i < N; i++) {
      const opponent = generateOpponent(addDays(START, i), sets);
      const problems = verifyOpponent(opponent, sets);
      if (problems.length) failures.push(`${opponent.day}: ${problems.join(', ')}`);
    }
    expect(failures).toEqual([]);
  }, 120_000);

  it('lets a player build any 6 of a pool with any sets', () => {
    // Players pick freely, so every team a pool allows must be legal, not just
    // the ones the generator checks (team-wide bans like Drizzle ++ Swift Swim).
    // Two forms of one species (Gen 4's Rotoms) can share a pool; Species Clause
    // allows only one on a team, so draws skip a second form, as a builder must.
    // From Gen 6 the builder also allows one Mega per team, so draws skip Mega
    // sets once a team has one (and species with only Mega sets).
    const validator = TeamValidator.get(format);
    const dex = Dex.forGen(FORMATS[format].gen);
    const base = (name: string) => dex.species.get(name).baseSpecies;
    const isMega = (item: string) => !!dex.items.get(item).megaStone;
    const rng = rngFor(`test:${format}:pool-teams`);
    const failures: string[] = [];
    for (let i = 0; i < 200; i++) {
      const { week, species } = generatePool(addDays(START, 7 * i), sets);
      for (let t = 0; t < 5; t++) {
        const left = [...species];
        let mega = false;
        const team = [];
        while (team.length < 6) {
          const name = left.splice(Math.floor(rng() * left.length), 1)[0]!;
          for (let j = left.length - 1; j >= 0; j--)
            if (base(left[j]!) === base(name)) left.splice(j, 1);
          const options = sets.species[name]!.sets.filter((s) => !mega || !isMega(s.item));
          if (!options.length) continue;
          const set = options[Math.floor(rng() * options.length)]!;
          mega ||= isMega(set.item);
          team.push(toPokemonSet(name, set));
        }
        const problems = validator.validateTeam(team);
        if (problems) failures.push(`${week}: ${problems.join(' ')}`);
      }
    }
    expect(failures).toEqual([]);
  }, 120_000);

  it('gives every Gen 6 pool a Mega, and no opponent two', () => {
    if (FORMATS[format].gen < 6) return;
    const dex = Dex.forGen(6);
    const isMega = (item: string) => !!dex.items.get(item).megaStone;
    let opponentsWithMega = 0;
    for (let i = 0; i < 300; i++) {
      const { species } = generatePool(addDays(START, 7 * i), sets);
      expect(species.some((s) => sets.species[s]!.sets.some((x) => isMega(x.item)))).toBe(true);
      const { team } = generateOpponent(addDays(START, i), sets);
      const megas = team.filter((slot) =>
        isMega(sets.species[slot.species]!.sets.find((s) => s.id === slot.setId)!.item),
      ).length;
      expect(megas).toBeLessThanOrEqual(1);
      if (megas) opponentsWithMega++;
    }
    expect(opponentsWithMega).toBeGreaterThan(0);
  });

  it('usually includes a hazard remover, but not always', () => {
    let withRemover = 0;
    for (let i = 0; i < 300; i++) {
      const { team } = generateOpponent(addDays(START, i), sets);
      const removes = team.some((slot) =>
        sets.species[slot.species]!.sets.find((s) => s.id === slot.setId)!.moves.some((m) =>
          ['Rapid Spin', 'Defog'].includes(m),
        ),
      );
      if (removes) withRemover++;
    }
    expect(withRemover).toBeGreaterThan(0);
    expect(withRemover).toBeLessThan(300);
  });
});
