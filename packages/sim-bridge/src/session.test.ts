import { describe, expect, it } from 'vitest';
import { RandomPolicy } from './policies/random';
import { deriveSeed, makeRng } from './rng';
import { runBattle } from './run';
import { BattleError, BattleSession } from './session';
import { randomTeam } from './teams';

function teams(i: number) {
  const rng = makeRng(deriveSeed('session:teams', i));
  return { p1: { team: randomTeam(rng) }, p2: { team: randomTeam(rng) } };
}

describe('BattleSession', () => {
  it('starts with both sides to move and their own lines to drain', () => {
    const s = new BattleSession({ seed: deriveSeed('session', 0), ...teams(0) });
    expect(s.turn).toBe(1);
    expect(s.request('p1')?.requestType).toBe('move');
    expect(s.request('p2')?.requestType).toBe('move');
    const lines = s.drain('p1');
    expect(lines).toContain('|turn|1');
    expect(s.drain('p1')).toEqual([]); // drained
  });

  it('resolves a turn once both sides choose', () => {
    const s = new BattleSession({ seed: deriveSeed('session', 1), ...teams(1) });
    s.drain('p1');
    s.choose('p1', 'move 1');
    expect(s.turn).toBe(1);
    expect(s.request('p1')).toBeNull();
    s.choose('p2', 'move 1');
    expect(s.drain('p1').some((l) => l.startsWith('|move|'))).toBe(true);
  });

  it('matches runBattle when driven by the same policies', () => {
    const input = { seed: deriveSeed('session', 2), ...teams(2) };
    const policy = new RandomPolicy();
    const rngs = { p1: makeRng('1,2,3,4'), p2: makeRng('5,6,7,8') };
    const s = new BattleSession(input);
    while (!s.ended) {
      for (const side of ['p1', 'p2'] as const) {
        const view = s.view(side);
        if (view) s.choose(side, policy.choose(view, rngs[side]));
        if (s.ended) break;
      }
    }
    const run = runBattle({
      ...input,
      p1: { ...input.p1, policy, seed: '1,2,3,4' },
      p2: { ...input.p2, policy, seed: '5,6,7,8' },
    });
    // Logs carry |t:| wall-clock lines, which differ if the two runs straddle a second.
    const stable = (r: typeof run) => ({
      ...r,
      spectatorLog: r.spectatorLog.filter((l) => !l.startsWith('|t:|')),
    });
    expect(stable(s.result())).toEqual(stable(run));
  });

  it('plays the same after a reseed with the same seed, and differently with another', () => {
    const input = { seed: deriveSeed('session', 5), ...teams(5) };
    const play = (seed: string) => {
      const s = new BattleSession(input);
      s.reseed(seed as never);
      for (let i = 0; i < 30 && !s.ended; i++)
        for (const side of ['p1', 'p2'] as const) {
          const req = s.view(side);
          if (req && !s.ended)
            s.choose(side, req.request.requestType === 'move' ? 'move 1' : 'default');
        }
      return s.spectatorLog.filter((l) => !l.startsWith('|t:|')).join('\n');
    };
    expect(play('1,2,3,4')).toBe(play('1,2,3,4'));
    expect(play('1,2,3,4')).not.toBe(play('9,9,9,9'));
  });

  it('reports the winning side, not its name, when players are named', () => {
    const { p1, p2 } = teams(4);
    const s = new BattleSession({
      seed: deriveSeed('session', 4),
      p1: { ...p1, name: 'You' },
      p2: { ...p2, name: 'The opponent' },
    });
    s.forfeit('p1');
    expect(s.winner).toBe('p2');
    expect(s.result().endReason).toBe('win');
  });

  it('forfeits and refuses choices it has no request for', () => {
    const s = new BattleSession({ seed: deriveSeed('session', 3), ...teams(3) });
    s.choose('p1', 'move 1');
    expect(() => s.choose('p1', 'move 1')).toThrow(BattleError);
    s.forfeit('p1');
    expect(s.ended).toBe(true);
    expect(s.winner).toBe('p2');
  });
});
