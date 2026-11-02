import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { coresFor, sets, setsFor } from '@daily-battle/data';
import { megaCount } from '@daily-battle/data/species';
import {
  addDays,
  findSet,
  GENERATOR_VERSION,
  parseSchedule,
  rngFor,
  teamSets,
  toPokemonSet,
  type ScheduleFile,
  type TeamSlot,
} from '@daily-battle/gen';
import type { SetsFile } from '@daily-battle/data';
import { TeamValidator, type PokemonSet } from '@pkmn/sim';
import { afterAll, describe, expect, it } from 'vitest';
import { PIPELINE } from './config';
import type { Job } from './job';
import { legalTeam, poolTeams } from './sample';
import { Simulator } from './simulate';
import { checkOpponent, hardCounters, poolSetsOf } from './validate-opponent';

const POOL = [
  'Tyranitar',
  'Heatran',
  'Scizor',
  'Starmie',
  'Swampert',
  'Gengar',
  'Latias',
  'Jirachi',
  'Skarmory',
  'Gyarados',
  'Breloom',
  'Blissey',
];
const inline = new Simulator(0);

/** A team that can't hurt anything: every Pokémon only has stat-lowering moves. */
function harmlessTeam(): PokemonSet[] {
  return ['Blissey', 'Chansey', 'Snorlax', 'Clefable', 'Wigglytuff', 'Miltank'].map((species) => ({
    name: species,
    species,
    item: 'Leftovers',
    ability: '',
    nature: 'Bold',
    evs: { hp: 252, atk: 0, def: 252, spa: 0, spd: 4, spe: 0 },
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    moves: ['Growl', 'Tail Whip', 'Leer', 'Sing'],
    level: 100,
    gender: '',
  }));
}

describe('opponent validation', () => {
  const small = { ...PIPELINE.opponent, samples: 40, screenSamples: 40, ladderSamples: 20 };
  const playerTeams = poolTeams(POOL, 20, rngFor('test:player-teams')).map((t) =>
    teamSets(sets, t),
  );

  it('rejects an intentionally bad opponent as too easy', async () => {
    const check = await checkOpponent(
      harmlessTeam(),
      'balance',
      playerTeams,
      poolSetsOf(POOL),
      inline,
      'test:harmless',
      small,
    );
    expect(check.problems.join()).toMatch(/too easy/);
    expect(check.metrics.uninformed!.rate).toBeGreaterThan(0.9);
  }, 120_000);

  it('flags a Pokémon the pool cannot touch as a hard counter', () => {
    const shedinja: PokemonSet = {
      name: 'Shedinja',
      species: 'Shedinja',
      item: 'Focus Sash',
      ability: 'Wonder Guard',
      nature: 'Adamant',
      evs: { hp: 0, atk: 252, def: 0, spa: 0, spd: 4, spe: 252 },
      ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
      moves: ['Shadow Sneak', 'X-Scissor', 'Will-O-Wisp', 'Protect'],
      level: 100,
      gender: '',
    };
    // A Blissey whose only attack, Seismic Toss, can't hit a Ghost.
    const blissey = poolSetsOf(['Blissey']).filter((s) => s.moves.includes('Seismic Toss'));
    expect(blissey.length).toBeGreaterThan(0);
    expect(hardCounters([shedinja], blissey, 0.3)).toEqual(['Shedinja']);
    expect(hardCounters([shedinja], poolSetsOf(['Tyranitar']), 0.3)).toEqual([]);
  });
});

describe('sampling and simulation', () => {
  afterAll(() => inline.close());

  it('draws deterministic, legal pool teams', () => {
    const a = poolTeams(POOL, 10, rngFor('test:sample'));
    const b = poolTeams(POOL, 10, rngFor('test:sample'));
    expect(a).toEqual(b);
    const validator = TeamValidator.get('gen4ou');
    for (const team of a) {
      expect(new Set(team.map((s) => s.species)).size).toBe(6);
      expect(team.every((s) => POOL.includes(s.species))).toBe(true);
      expect(validator.validateTeam(teamSets(sets, team))).toBeNull();
    }
  });

  it('gives the same results with 0 and 4 workers', async () => {
    const teams = poolTeams(POOL, 4, rngFor('test:workers')).map((t) => teamSets(sets, t));
    const opponent = teamSets(sets, poolTeams(POOL, 1, rngFor('test:opp'))[0]!);
    const jobs: Job[] = Array.from({ length: 12 }, (_, i) => ({
      format: 'gen4ou',
      bot: i % 2 ? 'naive' : 'mid',
      player: teams[i % teams.length]!,
      opponent,
      style: 'balance',
      seed: 'test:workers',
      index: i,
    }));
    const parallel = new Simulator(4);
    try {
      expect(await parallel.run(jobs)).toEqual(await inline.run(jobs));
    } finally {
      await parallel.close();
    }
  }, 120_000);
});

/**
 * A schedule's teams as the app plays them. Weeks built before the current
 * generator version may name sets a data update removed; the app plays those
 * as the species' most-used set (apps/web findSet), and so does this check.
 * Weeks built since must name only known sets.
 */
function asPlayed(data: SetsFile, schedule: ScheduleFile): TeamSlot[][] {
  const current = schedule.generatorVersion >= GENERATOR_VERSION;
  return [...schedule.days.map((d) => d.team), ...schedule.suggestedTeams.map((s) => s.team)].map(
    (team) =>
      team.map((slot) => {
        const sets = data.species[slot.species]!.sets;
        if (current || sets.some((s) => s.id === slot.setId)) return slot;
        const top = sets.reduce((a, b) => (b.weight > a.weight ? b : a));
        return { ...slot, setId: top.id };
      }),
  );
}

/** A schedule's cores, when it has them (weeks built since generator version 6), are real and whole in the pool. */
function expectCoresInPool(format: string, schedule: ScheduleFile) {
  const known = coresFor(format);
  for (const id of schedule.pool.cores ?? []) {
    const core = known.find((c) => c.id === id);
    expect(core, id).toBeDefined();
    expect(
      core!.members.every((m) => schedule.pool.species.includes(m)),
      id,
    ).toBe(true);
  }
}

describe('published schedule files', () => {
  const dir = new URL('../../../apps/web/public/schedule/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));

  it('exist', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)(
    '%s is well-formed and legal, with known sets since its generator version',
    (file) => {
      const schedule = parseSchedule(JSON.parse(readFileSync(new URL(file, dir), 'utf8')));
      expect(`${schedule.week}.json`).toBe(file);
      expect(schedule.days.map((d) => d.day)).toEqual(
        Array.from({ length: 7 }, (_, i) => addDays(schedule.week, i)),
      );
      expect(new Set(schedule.pool.species).size).toBe(12);
      expectCoresInPool('gen4ou', schedule);
      const validator = TeamValidator.get('gen4ou');
      for (const team of asPlayed(sets, schedule)) {
        expect(
          validator.validateTeam(
            team.map((slot) => toPokemonSet(slot.species, findSet(sets, slot))),
          ),
        ).toBeNull();
      }
      for (const s of schedule.suggestedTeams) {
        expect(s.team.every((slot) => schedule.pool.species.includes(slot.species))).toBe(true);
      }
    },
  );
});

describe('published Gen 6 schedule files', () => {
  const dir = new URL('../../../apps/web/public/schedule/gen6ou/', import.meta.url);
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
  const data = setsFor('gen6ou');
  const isMega = (species: string, setId: string) =>
    megaCount('gen6ou', [{ species, item: findSet(data, { species, setId }).item }]) > 0;

  // Until the first Gen 6 week is published there's nothing to check.
  if (!files.length) it.skip('no Gen 6 weeks published yet', () => {});

  it.each(files)('%s is legal, offers a Mega, and has at most one Mega per team', (file) => {
    const schedule = parseSchedule(JSON.parse(readFileSync(new URL(file, dir), 'utf8')));
    expect(`${schedule.week}.json`).toBe(file);
    expect(new Set(schedule.pool.species).size).toBe(12);
    expectCoresInPool('gen6ou', schedule);
    expect(
      schedule.pool.species.some((s) => data.species[s]!.sets.some((set) => isMega(s, set.id))),
    ).toBe(true);
    for (const team of asPlayed(data, schedule)) {
      // The validator plus our one-Mega rule.
      expect(legalTeam(data, team)).toBe(true);
      expect(team.filter((slot) => isMega(slot.species, slot.setId)).length).toBeLessThanOrEqual(1);
    }
  });
});

describe('published Gen 3 schedule files', () => {
  const dir = new URL('../../../apps/web/public/schedule/gen3ou/', import.meta.url);
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
  const data = setsFor('gen3ou');

  // Until the first Gen 3 week is published there's nothing to check.
  if (!files.length) it.skip('no Gen 3 weeks published yet', () => {});

  it.each(files)('%s is legal, with known sets since its version', (file) => {
    const schedule = parseSchedule(JSON.parse(readFileSync(new URL(file, dir), 'utf8')));
    expect(`${schedule.week}.json`).toBe(file);
    expect(new Set(schedule.pool.species).size).toBe(12);
    expectCoresInPool('gen3ou', schedule);
    for (const team of asPlayed(data, schedule)) {
      expect(legalTeam(data, team)).toBe(true);
    }
    for (const s of schedule.suggestedTeams) {
      expect(s.team.every((slot) => schedule.pool.species.includes(slot.species))).toBe(true);
    }
  });
});
