import { setsFor } from '@daily-battle/data';
import { describe, expect, it } from 'vitest';
import { RandomPolicy } from './policies/random';
import { ScriptedPolicy } from './policies/scripted';
import { deriveSeed, makeRng } from './rng';
import { runBattle } from './run';
import { BattleSession } from './session';
import { randomTeam } from './teams';
import type { RunBattleInput } from './types';

const gen3 = setsFor('gen3ou');

function input(i: number, noLuck: boolean): RunBattleInput {
  const rng = makeRng(deriveSeed('noluck-test:teams', i));
  return {
    format: 'gen3ou',
    seed: deriveSeed('noluck-test:battle', i),
    noLuck,
    p1: { team: randomTeam(rng, gen3), policy: new RandomPolicy(), seed: deriveSeed('p1', i) },
    p2: { team: randomTeam(rng, gen3), policy: new RandomPolicy(), seed: deriveSeed('p2', i) },
  };
}

// Lines that only luck produces.
const LUCK = [/^\|-crit\|/, /^\|-miss\|/, /^\|cant\|[^|]+\|(par|flinch)$/, /\[from\] confusion/];
const luckyLines = (log: string[]) => log.filter((l) => LUCK.some((re) => re.test(l)));

describe('noLuck', () => {
  it('removes crits, misses, full paralysis, flinches, and confusion hits', () => {
    let lucky = 0;
    let unlucky = 0;
    for (let i = 0; i < 30; i++) {
      lucky += luckyLines(runBattle(input(i, false)).spectatorLog).length;
      unlucky += luckyLines(runBattle(input(i, true)).spectatorLog).length;
    }
    expect(lucky).toBeGreaterThan(20); // the check has teeth
    expect(unlucky).toBe(0);
  });

  it('is still deterministic, with damage rolls still varying', () => {
    const a = runBattle(input(1, true));
    expect(runBattle(input(1, true)).spectatorLog).toEqual(a.spectatorLog);
    const damage = new Set(
      [0, 1, 2, 3].map((i) => {
        const s = new BattleSession({ ...input(0, true), seed: deriveSeed('roll', i) });
        s.choose('p1', 'move 1');
        s.choose('p2', 'move 1');
        return s.spectatorLog.filter((l) => l.startsWith('|-damage|')).join();
      }),
    );
    expect(damage.size).toBeGreaterThan(1);
  });
});

describe('ScriptedPolicy', () => {
  const mon = (species: string, moves: string[]) => ({
    name: species,
    species,
    item: '',
    ability: '',
    nature: 'Hardy',
    evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    moves,
    level: 100,
    gender: '',
  });

  it('plays its steps by name, then falls back', () => {
    const foe = new ScriptedPolicy({
      moves: ['move Recover', 'switch Skarmory', 'move Splash', 'move 1'],
      switches: ['switch Skarmory'],
    });
    const result = runBattle({
      format: 'gen3ou',
      seed: deriveSeed('scripted', 0),
      noLuck: true,
      p1: {
        team: [mon('Swampert', ['Surf'])],
        policy: new RandomPolicy(),
        seed: deriveSeed('p1', 0),
      },
      p2: {
        team: [mon('Starmie', ['Thunderbolt', 'Recover']), mon('Skarmory', ['Drill Peck'])],
        policy: foe,
        seed: deriveSeed('p2', 0),
      },
    });
    expect(result.choices.p2.slice(0, 2)).toEqual(['move 2', 'switch 2']);
    expect(foe.skipped).toContain('move Splash'); // not one of Skarmory's moves
  });
});
