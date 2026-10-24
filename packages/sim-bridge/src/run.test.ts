import { setsFor } from '@daily-battle/data';
import { describe, expect, it } from 'vitest';
import { leadChoice, RandomPolicy } from './policies/random';
import { deriveSeed, makeRng } from './rng';
import { BattleError, replayBattle, runBattle } from './run';
import { soak } from './soak';
import { randomTeam, toPokemonSet } from './teams';
import type { Policy, RunBattleInput } from './types';

function input(i: number, overrides: Partial<RunBattleInput> = {}): RunBattleInput {
  const rng = makeRng(deriveSeed('run-test:teams', i));
  return {
    seed: deriveSeed('run-test:battle', i),
    p1: { team: randomTeam(rng), policy: new RandomPolicy(), seed: deriveSeed('run-test:p1', i) },
    p2: { team: randomTeam(rng), policy: new RandomPolicy(), seed: deriveSeed('run-test:p2', i) },
    ...overrides,
  };
}

const withoutTimestamps = (log: string[]) => log.filter((l) => !l.startsWith('|t:|'));

describe('runBattle', () => {
  it('plays a gen4ou battle to the end', () => {
    const result = runBattle(input(0));
    expect(result.spectatorLog).toContain('|gen|4');
    expect(result.endReason).not.toBe('turnCap');
    expect(result.turns).toBeGreaterThan(0);
    expect(result.choices.p1.length).toBeGreaterThan(0);
  });

  it('is deterministic for fixed seeds', () => {
    const a = runBattle(input(1));
    const b = runBattle(input(1));
    expect(withoutTimestamps(a.spectatorLog)).toEqual(withoutTimestamps(b.spectatorLog));
    expect(a.choices).toEqual(b.choices);
  });

  it('replays recorded choices to the same battle', () => {
    const original = runBattle(input(2));
    const { p1, p2, ...rest } = input(2);
    const replayed = replayBattle(
      { ...rest, p1: { team: p1.team }, p2: { team: p2.team } },
      original.choices,
    );
    expect(withoutTimestamps(replayed.spectatorLog)).toEqual(
      withoutTimestamps(original.spectatorLog),
    );
    expect(replayed.winner).toBe(original.winner);
  });

  it('ties at the turn cap', () => {
    const result = runBattle(input(3, { maxTurns: 2 }));
    expect(result).toMatchObject({ endReason: 'turnCap', winner: null });
  });

  it('throws a BattleError with the seed on an invalid choice', () => {
    const bad: Policy = { choose: () => 'move 9' };
    const base = input(4);
    const run = () => runBattle({ ...base, p1: { ...base.p1, policy: bad } });
    expect(run).toThrow(BattleError);
    expect(run).toThrow(base.seed);
  });
});

describe('soak', () => {
  it('runs 100 random battles without errors', () => {
    const { results, errors } = soak({ n: 100, seed: 'vitest' });
    expect(errors).toEqual([]);
    expect(results).toHaveLength(100);
  }, 120_000);
});

describe('gen5ou (Team Preview)', () => {
  const data = setsFor('gen5ou');
  const gen5 = (i: number): RunBattleInput => {
    const rng = makeRng(deriveSeed('run-test:gen5:teams', i));
    return {
      format: 'gen5ou',
      seed: deriveSeed('run-test:gen5:battle', i),
      p1: { team: randomTeam(rng, data), policy: new RandomPolicy(), seed: deriveSeed('g5p1', i) },
      p2: { team: randomTeam(rng, data), policy: new RandomPolicy(), seed: deriveSeed('g5p2', i) },
    };
  };

  it('opens with Team Preview, where each side picks its lead', () => {
    const result = runBattle(gen5(0));
    expect(result.spectatorLog).toContain('|gen|5');
    expect(result.spectatorLog).toContain('|teampreview');
    expect(result.choices.p1[0]).toMatch(/^team [1-6]{6}$/);
    expect(result.choices.p2[0]).toMatch(/^team [1-6]{6}$/);
    expect(result.endReason).not.toBe('turnCap');
  });

  it('sends out the chosen lead', () => {
    const input = gen5(1);
    const lead: Policy = {
      choose: (view, rng) =>
        view.request.requestType === 'team'
          ? leadChoice(3, 6)
          : new RandomPolicy().choose(view, rng),
    };
    const result = runBattle({ ...input, maxTurns: 1, p1: { ...input.p1, policy: lead } });
    const species = input.p1.team[2]!.species.split('-')[0]!;
    const switchIn = result.spectatorLog.find((l) => l.startsWith('|switch|p1a:'))!;
    expect(switchIn).toContain(species);
  });

  it('replays recorded choices, team choices included, to the same battle', () => {
    const original = runBattle(gen5(2));
    const { p1, p2, ...rest } = gen5(2);
    const replayed = replayBattle(
      { ...rest, p1: { team: p1.team }, p2: { team: p2.team } },
      original.choices,
    );
    expect(withoutTimestamps(replayed.spectatorLog)).toEqual(
      withoutTimestamps(original.spectatorLog),
    );
  });

  it('runs 100 random battles without errors', () => {
    const { results, errors } = soak({ n: 100, seed: 'vitest-gen5', format: 'gen5ou' });
    expect(errors).toEqual([]);
    expect(results).toHaveLength(100);
  }, 120_000);
});

describe('gen3ou', () => {
  it('runs 100 random battles without errors', () => {
    const { results, errors } = soak({ n: 100, seed: 'vitest-gen3', format: 'gen3ou' });
    expect(errors).toEqual([]);
    expect(results).toHaveLength(100);
  }, 120_000);
});

describe('leadChoice', () => {
  it('leads with one Pokémon and keeps the rest in order', () => {
    expect(leadChoice(1, 6)).toBe('team 123456');
    expect(leadChoice(4, 6)).toBe('team 412356');
    expect(leadChoice(2, 3)).toBe('team 213');
  });
});

describe('unavailable choices', () => {
  it('lets a side choose again when Imprison turns out to block its move', () => {
    const data = setsFor('gen5ou');
    const set = (species: string, id: string) =>
      toPokemonSet(
        species,
        data.species[species]!.sets.find((s) => s.id === id)!,
      );
    // Landorus-T's lead set has Imprison (move 3) and Earthquake; Hippowdon
    // keeps trying Earthquake (move 2), which Imprison blocks without telling it.
    const imprison: Policy = {
      choose: (view, rng) =>
        view.request.requestType === 'move' && view.battle.turn === 1
          ? 'move 3'
          : new RandomPolicy().choose(view, rng),
    };
    let rejected = 0;
    const earthquake: Policy = {
      choose: (view, rng) => {
        const req = view.request;
        if (req.requestType !== 'move') return new RandomPolicy().choose(view, rng);
        const blocked = req.active[0]!.moves[1]!;
        if ('disabled' in blocked && blocked.disabled) {
          rejected++;
          return new RandomPolicy().choose(view, rng);
        }
        return 'move 2';
      },
    };
    const input = {
      format: 'gen5ou',
      seed: '1,2,3,4' as const,
      maxTurns: 4,
      p1: {
        team: [set('Landorus-Therian', 'landorustherian-lead')],
        policy: imprison,
        seed: '1,1,1,1' as const,
      },
      p2: {
        team: [set('Hippowdon', 'hippowdon-mixed-wall')],
        policy: earthquake,
        seed: '2,2,2,2' as const,
      },
    };
    const result = runBattle(input);
    // The sim marked Earthquake disabled after the blocked try, and the battle went on.
    expect(rejected).toBeGreaterThan(0);
    expect(result.turns).toBeGreaterThan(2);
    // The rejected choice isn't recorded, so a replay matches.
    const replayed = replayBattle(
      { ...input, p1: { team: input.p1.team }, p2: { team: input.p2.team } },
      result.choices,
    );
    expect(withoutTimestamps(replayed.spectatorLog)).toEqual(
      withoutTimestamps(result.spectatorLog),
    );
  });
});
