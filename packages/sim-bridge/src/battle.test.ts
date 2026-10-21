import { describe, expect, it } from 'vitest';
import { runRandomBattle } from './battle';
import { SAMPLE_TEAM_A, SAMPLE_TEAM_B } from './teams';

describe('runRandomBattle', () => {
  it('plays a full gen4ou battle to completion', async () => {
    const result = await runRandomBattle({
      p1Team: SAMPLE_TEAM_A,
      p2Team: SAMPLE_TEAM_B,
      seed: '1,2,3,4',
      p1Seed: '5,6,7,8',
      p2Seed: '9,10,11,12',
    });
    expect(result.log).toContain('|gen|4');
    expect(result.turns).toBeGreaterThan(0);
    expect(result.log.some((l) => l.startsWith('|win|') || l.startsWith('|tie'))).toBe(true);
    expect(result.log.some((l) => l.startsWith('|error|'))).toBe(false);
  });

  it('is deterministic for fixed seeds', async () => {
    const opts = {
      p1Team: SAMPLE_TEAM_A,
      p2Team: SAMPLE_TEAM_B,
      seed: '1,2,3,4',
      p1Seed: '5,6,7,8',
      p2Seed: '9,10,11,12',
    } as const;
    const [a, b] = await Promise.all([runRandomBattle(opts), runRandomBattle(opts)]);
    const strip = (log: string[]) => log.filter((l) => !l.startsWith('|t:|'));
    expect(strip(a.log)).toEqual(strip(b.log));
  });

  it('runs 50 random-seed battles without errors', async () => {
    for (let i = 0; i < 50; i++) {
      const result = await runRandomBattle({ p1Team: SAMPLE_TEAM_A, p2Team: SAMPLE_TEAM_B });
      expect(result.log.some((l) => l.startsWith('|error|'))).toBe(false);
    }
  }, 60_000);
});
