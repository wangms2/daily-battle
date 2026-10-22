import { afterEach, describe, expect, it, vi } from 'vitest';
import schedule from '../../public/schedule/2026-10-19.json';
import type { Attempt, DayChange, DayState, Slot } from '../state/schema';
import { summarizeDay } from './results';
import { shareResult, shareText } from './share';

const DAY = '2026-10-21';
const TEAM: Slot[] = ['Hippowdon', 'Azelf', 'Celebi', 'Heatran', 'Jirachi', 'Lucario'].map(
  (species) => ({ species, setId: `${species.toLowerCase()}-x` }),
);
const a = (result: Attempt['result'], remaining: number): Attempt => ({
  result,
  remaining,
  ts: 1,
  lead: 'Hippowdon',
  team: TEAM,
  battleSeed: '1',
  aiSeed: '2',
  choices: [],
  engine: 'e',
});
const swap: DayChange = {
  kind: 'replace',
  slot: 3,
  from: { species: 'Gyarados', setId: 'g' },
  to: TEAM[3]!,
};
function text(
  attempts: Attempt[],
  streak: number,
  { isToday = true, change }: { isToday?: boolean; change?: DayChange } = {},
) {
  const day: DayState = { swapUsed: !!change, change, attempts };
  return shareText({ day: DAY, summary: summarizeDay(day, isToday), streak, change });
}

describe('share text', () => {
  it('celebrates a first-try win', () => {
    expect(text([a('win', 4)], 5)).toBe(
      [
        'Daily Battle · Oct 21',
        '⭐ First try! 4/6 left',
        '🟩🟩🟩🟩⬛⬛',
        'Hippowdon, Azelf, Celebi, Heatran, Jirachi, Lucario',
        '🔥 5-day streak',
      ].join('\n'),
    );
  });

  it('shows each try that counted when won on try 3, with the swap marked', () => {
    expect(text([a('loss', 0), a('forfeit', 1), a('win', 2)], 6, { change: swap })).toBe(
      [
        'Daily Battle · Oct 21',
        '✅ Won on try 3 · 2/6 left',
        '❌ ⬛⬛⬛⬛⬛⬛',
        '❌ ⬜⬛⬛⬛⬛⬛', // given up: grey
        '✅ 🟩🟩⬛⬛⬛⬛',
        'Hippowdon, Azelf, Celebi, Heatran*, Jirachi, Lucario',
        '🔥 6-day streak',
      ].join('\n'),
    );
  });

  it('says when the day was not cleared in 3 tries', () => {
    expect(text([a('loss', 2), a('loss', 0), a('loss', 1)], 0)).toBe(
      [
        'Daily Battle · Oct 21',
        '❌ Not cleared in 3 tries',
        '❌ 🟩🟩⬛⬛⬛⬛',
        '❌ ⬛⬛⬛⬛⬛⬛',
        '❌ 🟩⬛⬛⬛⬛⬛',
        'Hippowdon, Azelf, Celebi, Heatran, Jirachi, Lucario',
        '🔥 Streak reset',
      ].join('\n'),
    );
  });

  it('shows a late clear, still listing only the 3 tries that counted', () => {
    const t = text([a('loss', 0), a('loss', 0), a('loss', 0), a('loss', 1), a('win', 3)], 0);
    expect(t.split('\n').slice(1, 5)).toEqual([
      '✅ Won on try 5 · 3/6 left',
      '❌ ⬛⬛⬛⬛⬛⬛',
      '❌ ⬛⬛⬛⬛⬛⬛',
      '❌ ⬛⬛⬛⬛⬛⬛',
    ]);
    expect(t).toContain('🔥 Streak reset');
  });

  it('shares a day still in progress, keeping the streak line', () => {
    expect(text([a('loss', 1)], 4)).toBe(
      [
        'Daily Battle · Oct 21',
        'Not cleared yet · 1 of 3 tries',
        '❌ 🟩⬛⬛⬛⬛⬛',
        'Hippowdon, Azelf, Celebi, Heatran, Jirachi, Lucario',
        '🔥 4-day streak',
      ].join('\n'),
    );
    expect(text([a('loss', 1)], 0)).not.toContain('🔥');
  });

  it('stays short and never names the opponent', () => {
    const opponents = schedule.days.find((d) => d.day === DAY)!.team.map((s) => s.species);
    const ours = new Set(TEAM.map((s) => s.species));
    for (const t of [
      text([a('win', 4)], 5),
      text([a('loss', 0), a('loss', 0), a('win', 1), a('win', 6)], 1),
      text([a('loss', 0), a('loss', 0), a('loss', 0), a('win', 1)], 0),
    ]) {
      expect(t.split('\n').length).toBeLessThanOrEqual(7);
      for (const s of opponents) if (!ours.has(s)) expect(t).not.toContain(s);
      expect(t).not.toMatch(/turn/i);
    }
  });
});

describe('shareResult', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses the system share sheet when there is one', async () => {
    const share = vi.fn(async () => {});
    vi.stubGlobal('navigator', { share, clipboard: { writeText: vi.fn() } });
    expect(await shareResult('hi')).toBe('shared');
    expect(share).toHaveBeenCalledWith({ text: 'hi' });
  });

  it('copies to the clipboard otherwise, and reports when neither works', async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    expect(await shareResult('hi')).toBe('copied');
    expect(writeText).toHaveBeenCalledWith('hi');
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn(async () => Promise.reject(new Error('no'))) },
    });
    expect(await shareResult('hi')).toBe('manual');
  });
});
