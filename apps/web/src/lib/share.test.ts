import { afterEach, describe, expect, it, vi } from 'vitest';
import schedule from '../../public/schedule/2026-10-19.json';
import type { Attempt, DayChange, DayState, Slot } from '../state/schema';
import { summarizeDay } from './results';
import headers from '../../public/_headers?raw';
import {
  anyShareText,
  imageMode,
  shareAll,
  shareImage,
  shareModel,
  shareResult,
  shareText,
} from './share';

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
  { isToday = true, change, url }: { isToday?: boolean; change?: DayChange; url?: string } = {},
) {
  const day: DayState = { swapUsed: !!change, change, attempts };
  return shareText({ day: DAY, summary: summarizeDay(day, isToday), streak, change, url });
}

describe('share text', () => {
  it('names the game after Pokémon Daily, with the link to that game', () => {
    const day: DayState = { swapUsed: false, attempts: [a('win', 4)] };
    const out = shareText({
      day: DAY,
      summary: summarizeDay(day, true),
      streak: 1,
      game: 'Gen 5 OU',
      url: 'https://battle.example/#gen5',
    }).split('\n');
    expect(out[0]).toBe('Pokémon Daily · Gen 5 OU · Oct 21');
    expect(out.at(-1)).toBe('https://battle.example/#gen5');
  });

  it('names Easy and Hard after the game, and Normal not at all', () => {
    const header = (difficulty: 'easy' | 'normal' | 'hard') => {
      const attempts = [{ ...a('win', 4), ...(difficulty !== 'normal' && { difficulty }) }];
      return shareText({
        day: DAY,
        summary: summarizeDay({ swapUsed: false, attempts }, true, difficulty),
        streak: 1,
        game: 'Gen 4 OU',
        difficulty,
      }).split('\n')[0];
    };
    expect(header('hard')).toBe('Pokémon Daily · Gen 4 OU · Hard · Oct 21');
    expect(header('easy')).toBe('Pokémon Daily · Gen 4 OU · Easy · Oct 21');
    expect(header('normal')).toBe('Pokémon Daily · Gen 4 OU · Oct 21');
  });

  it('says Coached, with the difficulty the deciding try was played on', () => {
    const header = (attempts: Attempt[]) =>
      shareText({
        day: DAY,
        summary: summarizeDay({ swapUsed: false, attempts }, true, 'coached'),
        streak: 1,
        game: 'Gen 3 OU',
        difficulty: 'normal',
        coached: true,
      }).split('\n')[0];
    const easy = { ...a('win', 4), coached: true as const, difficulty: 'easy' as const };
    expect(header([easy])).toBe('Pokémon Daily · Gen 3 OU · Easy · Coached · Oct 21');
    expect(header([{ ...a('loss', 0), coached: true }])).toBe(
      'Pokémon Daily · Gen 3 OU · Coached · Oct 21',
    );
  });

  it('celebrates a first-try win', () => {
    expect(text([a('win', 4)], 5)).toBe(
      [
        'Pokémon Daily · Oct 21',
        '⭐ First try! 4/6 left',
        '✅ 🟩🟩🟩🟩⬛⬛',
        'Hippowdon, Azelf, Celebi, Heatran, Jirachi, Lucario',
        '🔥 5-day streak',
      ].join('\n'),
    );
  });

  it('shows each try that counted when won on try 3, with the swap marked', () => {
    expect(text([a('loss', 0), a('forfeit', 1), a('win', 2)], 0, { change: swap })).toBe(
      [
        'Pokémon Daily · Oct 21',
        '✅ Won on try 3 · 2/6 left',
        '❌ ⬛⬛⬛⬛⬛⬛',
        '❌ ⬜⬛⬛⬛⬛⬛', // given up: grey
        '✅ 🟩🟩⬛⬛⬛⬛',
        'Hippowdon, Azelf, Celebi, Heatran*, Jirachi, Lucario',
        '🔥 Streak reset', // only first-try wins keep it
      ].join('\n'),
    );
  });

  it('says when a past day was never cleared', () => {
    expect(text([a('loss', 2), a('loss', 0), a('loss', 1)], 0, { isToday: false })).toBe(
      [
        'Pokémon Daily · Oct 21',
        '❌ Not cleared',
        '❌ 🟩🟩⬛⬛⬛⬛',
        '❌ ⬛⬛⬛⬛⬛⬛',
        '❌ 🟩⬛⬛⬛⬛⬛',
        'Hippowdon, Azelf, Celebi, Heatran, Jirachi, Lucario',
        '🔥 Streak reset',
      ].join('\n'),
    );
  });

  it('lists every try up to a late win, however many', () => {
    const t = text([a('loss', 0), a('loss', 0), a('loss', 0), a('loss', 1), a('win', 3)], 0);
    expect(t.split('\n').slice(1, 7)).toEqual([
      '✅ Won on try 5 · 3/6 left',
      '❌ ⬛⬛⬛⬛⬛⬛',
      '❌ ⬛⬛⬛⬛⬛⬛',
      '❌ ⬛⬛⬛⬛⬛⬛',
      '❌ 🟩⬛⬛⬛⬛⬛',
      '✅ 🟩🟩🟩⬛⬛⬛',
    ]);
    expect(t).toContain('🔥 Streak reset');
  });

  it('keeps the ends of a day past ten tries: the first, a count, and the last two', () => {
    const tries = [a('loss', 2), ...Array.from({ length: 12 }, () => a('loss', 0)), a('win', 1)];
    expect(text(tries, 0).split('\n').slice(1, 6)).toEqual([
      '✅ Won on try 14 · 1/6 left',
      '❌ 🟩🟩⬛⬛⬛⬛',
      '⋯ 11 tries more',
      '❌ ⬛⬛⬛⬛⬛⬛',
      '✅ 🟩⬛⬛⬛⬛⬛',
    ]);
    // Ten fit whole.
    const ten = Array.from({ length: 10 }, () => a('loss', 0));
    expect(text(ten, 0)).not.toContain('⋯');
  });

  it('shares a day still in progress, the streak already reset', () => {
    expect(text([a('loss', 1)], 0)).toBe(
      [
        'Pokémon Daily · Oct 21',
        'Not cleared yet · 1 try',
        '❌ 🟩⬛⬛⬛⬛⬛',
        'Hippowdon, Azelf, Celebi, Heatran, Jirachi, Lucario',
        '🔥 Streak reset',
      ].join('\n'),
    );
  });

  it('never shares practice runs after the win', () => {
    const practice = { ...a('win', 6), practiceChange: swap };
    const tries = [a('win', 4), a('loss', 0), practice];
    expect(text(tries, 5)).toBe(
      [
        'Pokémon Daily · Oct 21',
        '⭐ First try! 4/6 left',
        '✅ 🟩🟩🟩🟩⬛⬛',
        'Hippowdon, Azelf, Celebi, Heatran, Jirachi, Lucario',
        '🔥 5-day streak',
      ].join('\n'),
    );
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
      // Past ten tries the middle becomes a count, so even a long day stays short.
      text([...Array.from({ length: 30 }, () => a('loss', 0)), a('win', 1)], 0, { url }),
    ]) {
      expect(t.split('\n').length).toBeLessThanOrEqual(16); // header, rows (five if condensed), team, streak, link
      for (const s of opponents) if (!ours.has(s)) expect(t).not.toContain(s);
      expect(t).not.toMatch(/turn/i);
    }
  });
});

describe('share all', () => {
  const game = (name: string, attempts: Attempt[], streak: number, difficulty?: 'easy') =>
    shareModel({
      day: DAY,
      summary: summarizeDay(
        { swapUsed: false, attempts: attempts.map((x) => ({ ...x, difficulty })) },
        true,
        difficulty,
      ),
      streak,
      game: name,
      difficulty,
      url: 'https://battle.example/#daily',
    });

  it('is nothing before any game is played, and that game’s own share for just one', () => {
    const none = game('Gen 4 OU', [], 0);
    expect(shareAll([none], 'u')).toBeNull();
    const one = game('Gen 3 OU', [a('win', 4)], 2);
    expect(shareAll([one, none], 'u')).toBe(one);
  });

  it('puts two or more played games on one compact share, in picker order', () => {
    const all = shareAll(
      [
        game('Gen 3 OU', [a('win', 4)], 5, 'easy'),
        game('Gen 4 OU', [], 0),
        game('Gen 5 OU', [a('loss', 0), a('win', 2)], 0),
        game('Gen 6 OU', [a('loss', 0)], 0),
      ],
      'https://battle.example/#daily',
    )!;
    expect(anyShareText(all)).toBe(
      [
        'Pokémon Daily · Oct 21',
        'Gen 3 OU · Easy · 🔥 5-day streak',
        '⭐ 🟩🟩🟩🟩⬛⬛ First try!',
        'Gen 5 OU · Streak reset',
        '✅ 🟩🟩⬛⬛⬛⬛ Won on try 2',
        'Gen 6 OU · Streak reset',
        '❌ ⬛⬛⬛⬛⬛⬛ Not cleared yet · 1 try',
        'https://battle.example/#daily',
      ].join('\n'),
    );
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

  it('copies the picture on desktops, even with a share sheet (Windows)', () => {
    vi.stubGlobal('ClipboardItem', class {});
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('pointer: fine') }));
    vi.stubGlobal('navigator', {
      share: vi.fn(),
      canShare: () => true,
      clipboard: { write: vi.fn() },
    });
    expect(imageMode()).toBe('copy');
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

describe('shareImage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shares the image alone, so Copy in the share sheet copies the picture', async () => {
    const share = vi.fn(async (_data: ShareData) => {});
    vi.stubGlobal('navigator', { share, canShare: () => true });
    const blob = new Blob([new Uint8Array(4)], { type: 'image/png' });
    expect(await shareImage(blob, { name: 'card.png' })).toBe('shared');
    const data = share.mock.calls[0]![0];
    expect(Object.keys(data)).toEqual(['files']);
    expect(data.files![0]!.name).toBe('card.png');
  });

  it('is allowed to show its preview (a blob: image) by the deployed CSP', () => {
    expect(headers).toMatch(/img-src [^;]* blob:/);
  });
});
