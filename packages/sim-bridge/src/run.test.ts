import { describe, expect, it } from 'vitest';
import { RandomPolicy } from './policies/random';
import { deriveSeed, makeRng } from './rng';
import { BattleError, replayBattle, runBattle } from './run';
import { soak } from './soak';
import { randomTeam } from './teams';
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
