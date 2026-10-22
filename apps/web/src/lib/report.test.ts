import { parseReports, REPORT_HEADER } from '@daily-battle/gen/report';
import { describe, expect, it } from 'vitest';
import { initialState, type Attempt, type Slot } from '../state/schema';
import { buildReport, reportText } from './report';

const TEAM: Slot[] = ['Heatran', 'Scizor', 'Jirachi', 'Lucario', 'Celebi', 'Azelf'].map(
  (species) => ({ species, setId: `${species.toLowerCase()}-x` }),
);
const a = (result: Attempt['result'], remaining: number, choices: number): Attempt => ({
  result,
  remaining,
  ts: 1,
  lead: 'Heatran',
  team: TEAM,
  battleSeed: 'SECRET-SEED-1',
  aiSeed: 'SECRET-SEED-2',
  choices: Array.from({ length: choices }, () => 'move 1'),
  engine: 'e',
});

function state() {
  const s = initialState();
  s.days['2026-10-21'] = { swapUsed: false, attempts: [a('loss', 0, 20), a('win', 3, 31)] };
  s.days['2026-10-20'] = { swapUsed: false, attempts: [a('forfeit', 6, 2)] };
  s.days['2026-10-22'] = { swapUsed: false, attempts: [a('inProgress', 6, 4)] };
  return s;
}

describe('playtest report', () => {
  it('lists each played day’s tries in order, with the tester’s own team', () => {
    expect(buildReport(state(), 'sim 1 ai 1')).toEqual({
      v: 1,
      engine: 'sim 1 ai 1',
      hints: true,
      speed: 'normal',
      days: [
        {
          d: '2026-10-20',
          team: TEAM.map((t) => t.species),
          tries: [{ r: 'f', left: 6, n: 2, lead: 'Heatran' }],
        },
        {
          d: '2026-10-21',
          team: TEAM.map((t) => t.species),
          tries: [
            { r: 'l', left: 0, n: 20, lead: 'Heatran' },
            { r: 'w', left: 3, n: 31, lead: 'Heatran' },
          ],
        },
      ],
    });
  });

  it('round-trips through the parser, even wrapped or pasted twice in a chat', () => {
    const text = reportText(state(), 'e');
    expect(text.startsWith(`${REPORT_HEADER}\n`)).toBe(true);
    const wrapped = `hey here's mine:\n${text.slice(0, 60)}\n${text.slice(60)}\n\nand again ${text}`;
    const parsed = parseReports(wrapped);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual(buildReport(state(), 'e'));
  });

  it('never includes seeds or choices', () => {
    const text = reportText(state(), 'e');
    expect(text).not.toContain('SECRET');
    expect(text).not.toContain('move 1');
  });
});
