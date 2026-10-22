import { afterEach, describe, expect, it, vi } from 'vitest';
import schedule from '../../public/schedule/2026-10-19.json';
import type { Attempt, DayChange, DayState, Slot } from '../state/schema';
import { summarizeDay } from './results';
import { imageMode, shareResult, shareText } from './share';

const DAY = '2026-10-21';
const TEAM: Slot[] = ['Hippowdon', 'Azelf', 'Celebi', 'Heatran', 'Jirachi', 'Lucario'].map(
  (species) => ({ species, setId: `${species.toLowerCase()}-x` }),
);
let nextTs = 1;
const a = (result: Attempt['result'], remaining: number): Attempt => ({
  result,
  remaining,
  ts: nextTs++,
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
  {
    isToday = true,
    change,
    run,
    url,
  }: { isToday?: boolean; change?: DayChange; run?: Attempt; url?: string } = {},
) {
  const day: DayState = { swapUsed: !!change, change, attempts };
  return shareText({ day: DAY, summary: summarizeDay(day, isToday), streak, change, run, url });
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

  it('adds a practice run shared from its end card, without counting it as a try', () => {
    const practice = { ...a('win', 6), practiceChange: swap };
    const tries = [a('win', 4), a('loss', 0), practice];
    expect(text(tries, 5, { run: practice })).toBe(
      [
        'Daily Battle · Oct 21',
        '⭐ First try! 4/6 left',
        '🟩🟩🟩🟩⬛⬛',
        '🔁 Practice ✅ 🟩🟩🟩🟩🟩🟩 · with Heatran',
        'Hippowdon, Azelf, Celebi, Heatran, Jirachi, Lucario',
        '🔥 5-day streak',
      ].join('\n'),
    );
    // A try that counted, or the day's late win, isn't repeated as practice.
    expect(text(tries, 5, { run: tries[0] })).not.toContain('Practice');
    const late = [a('loss', 0), a('loss', 0), a('loss', 0), a('win', 2)];
    expect(text(late, 0, { run: late[3] })).not.toContain('Practice');
  });

  it('ends with the link to play', () => {
    const t = text([a('win', 4)], 5, { url: 'https://battle.peanutbuilds.com' });
    expect(t.split('\n').slice(-2)).toEqual(['🔥 5-day streak', 'https://battle.peanutbuilds.com']);
  });

  it('stays short and never names the opponent', () => {
    const opponents = schedule.days.find((d) => d.day === DAY)!.team.map((s) => s.species);
    const ours = new Set(TEAM.map((s) => s.species));
    const url = 'https://battle.peanutbuilds.com';
    for (const t of [
      text([a('win', 4)], 5, { url }),
      text([a('loss', 0), a('loss', 0), a('win', 1), a('win', 6)], 1, { url }),
      text([a('loss', 0), a('loss', 0), a('loss', 0), a('win', 1)], 0, { url }),
    ]) {
      expect(t.split('\n').length).toBeLessThanOrEqual(8); // 7 plus the link
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

describe('imageMode', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('prefers the system share sheet when it takes files (phones)', () => {
    vi.stubGlobal('navigator', { share: vi.fn(), canShare: () => true });
    expect(imageMode()).toBe('share');
    // Older share sheets with no canShare still get to try.
    vi.stubGlobal('navigator', { share: vi.fn() });
    expect(imageMode()).toBe('share');
  });

  it('copies on desktops whose share sheet refuses files, else saves', () => {
    vi.stubGlobal('ClipboardItem', class {});
    vi.stubGlobal('navigator', {
      share: vi.fn(),
      canShare: () => false,
      clipboard: { write: vi.fn() },
    });
    expect(imageMode()).toBe('copy');
    vi.stubGlobal('ClipboardItem', undefined);
    vi.stubGlobal('navigator', {});
    expect(imageMode()).toBe('save');
  });
});
