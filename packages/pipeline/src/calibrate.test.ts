import { addDays } from '@daily-battle/gen';
import type { PlaytestReport } from '@daily-battle/gen/report';
import { describe, expect, it } from 'vitest';
import { calibrate, predictionsFrom } from './calibrate';

const report = (days: PlaytestReport['days']): PlaytestReport => ({
  v: 1,
  engine: 'e',
  hints: true,
  speed: 'fast',
  days,
});
const t = (r: 'w' | 'l' | 'f') => ({ r, left: r === 'w' ? 2 : 0, n: 10, lead: 'Heatran' });
const day = (d: string, ...tries: ReturnType<typeof t>[]) => ({ d, team: ['Heatran'], tries });

describe('calibrate', () => {
  it('tallies first tries, retries, and days kept against the bot', () => {
    const md = calibrate(
      [
        report([day('2026-10-19', t('w')), day('2026-10-20', t('l'), t('l'), t('w'))]),
        report([
          day('2026-10-19', t('l'), t('w')),
          day('2026-10-20', t('l'), t('f'), t('l'), t('w')),
        ]),
        report([day('2026-10-19', t('l'))]), // undecided: no "kept" entry
      ],
      new Map([
        ['2026-10-19', { first: 0.5, retry: 0.5 }],
        ['2026-10-20', { first: 0.4, retry: 0.5 }],
      ]),
    );
    expect(md).toContain('3 report(s), 5 played day(s).');
    // 2026-10-19: first tries 1/3; retries 1/1 (the undecided player hasn't retried); kept 2/2.
    expect(md).toMatch(
      /\| 2026-10-19 \| 3 \| 33\.3% \(1\/3,.*\| 50\.0% \| 100\.0% \(1\/1,.*\| 50\.0% \| 100\.0% \(2\/2,.*\| 87\.5% \|/,
    );
    // 2026-10-20: retries are tries 2–3 only (the try-4 win is practice): 1/4; kept 1/2.
    expect(md).toMatch(/\| 2026-10-20 \| 2 \| 0\.0% \(0\/2,.*\| 25\.0% \(1\/4,.*\| 50\.0% \(1\/2,/);
    expect(md).toContain('| **All** | 5 | 20.0% (1/5,');
    expect(md).toMatch(/below the bot by 25\.0%/);
    expect(md).toMatch(/move the uninformed band by about \+30\.0%/);
  });

  it('reads predictions from pipeline week reports', () => {
    const metrics = (u: number, i: number) => ({
      check: { metrics: { uninformed: { rate: u }, informed: { rate: i } } },
    });
    const p = predictionsFrom(
      [{ week: '2026-10-19', days: [metrics(0.5, 0.4), metrics(0.6, 0.5)] }],
      addDays,
    );
    expect(p.get('2026-10-20')).toEqual({ first: 0.6, retry: 0.5 });
  });
});
