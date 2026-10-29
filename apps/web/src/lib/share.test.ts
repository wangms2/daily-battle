import { afterEach, describe, expect, it, vi } from 'vitest';
import schedule from '../../public/schedule/2026-10-19.json';
import type { Attempt, DayChange, DayState, Slot } from '../state/schema';
import { summarizeDay } from './results';
import headers from '../../public/_headers?raw';
import {
  anyShareText,
  imageMode,
  isShareGame,
  shareAll,
  shareGame,
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

  it('is compact: the header, the deciding try’s squares, then the streak; no team', () => {
    expect(text([a('win', 4)], 5)).toBe(
      ['Pokémon Daily · Oct 21', '⭐ 🟩🟩🟩🟩⬛⬛ First try!', '🔥 5-day streak'].join('\n'),
    );
    expect(text([a('loss', 0), a('forfeit', 1), a('win', 2)], 0, { change: swap })).toBe(
      ['Pokémon Daily · Oct 21', '✅ 🟩🟩⬛⬛⬛⬛ Won on try 3', 'Streak reset'].join('\n'),
    );
  });

  it('says when a day isn’t cleared, or not yet', () => {
    expect(text([a('loss', 2), a('loss', 0), a('loss', 1)], 0, { isToday: false })).toBe(
      ['Pokémon Daily · Oct 21', '❌ 🟩⬛⬛⬛⬛⬛ Not cleared', 'Streak reset'].join('\n'),
    );
    expect(text([a('loss', 1)], 0).split('\n')[1]).toBe('❌ 🟩⬛⬛⬛⬛⬛ Not cleared yet · 1 try');
  });

  it('greys out a try that was given up', () => {
    expect(text([a('forfeit', 2)], 0).split('\n')[1]).toBe(
      '❌ ⬜⬜⬛⬛⬛⬛ Not cleared yet · 1 try',
    );
  });

  it('never shares practice runs after the win', () => {
    const practice = { ...a('win', 6), practiceChange: swap };
    expect(text([a('win', 4), a('loss', 0), practice], 5).split('\n')[1]).toBe(
      '⭐ 🟩🟩🟩🟩⬛⬛ First try!',
    );
  });

  it('counts the game’s stars whatever the streak: first tries and clears', () => {
    const day: DayState = { swapUsed: false, attempts: [a('loss', 0), a('win', 3)] };
    const share = (stars: { firstTries: number; clears: number }) =>
      shareText({ day: DAY, summary: summarizeDay(day, true), streak: 0, stars }).split('\n');
    // Won on try 2: the streak is reset, but the collection stays.
    expect(share({ firstTries: 10, clears: 23 })).toContain('Streak reset · ⭐ 10 · ✓ 23');
    // Nothing to show before the first clear.
    expect(share({ firstTries: 0, clears: 0 }).join('\n')).not.toContain('✓');
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
      text([...Array.from({ length: 30 }, () => a('loss', 0)), a('win', 1)], 0, { url }),
    ]) {
      expect(t.split('\n').length).toBeLessThanOrEqual(4); // header, result, streak, link
      for (const s of opponents) if (!ours.has(s)) expect(t).not.toContain(s);
      expect(t).not.toMatch(/turn/i);
    }
  });
});

describe('share all', () => {
  const game = (
    name: string,
    attempts: Attempt[],
    streak: number,
    difficulty?: 'easy',
    stars?: { firstTries: number; clears: number },
  ) =>
    shareModel({
      ...(stars && { stars }),
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
        game('Gen 3 OU', [a('win', 4)], 5, 'easy', { firstTries: 10, clears: 23 }),
        game('Gen 4 OU', [], 0),
        game('Gen 5 OU', [a('loss', 0), a('win', 2)], 0),
        game('Gen 6 OU', [a('loss', 0)], 0),
      ],
      'https://battle.example/#daily',
    )!;
    expect(anyShareText(all)).toBe(
      [
        'Pokémon Daily · Oct 21',
        'Gen 3 OU · Easy · 🔥 5-day streak · ⭐ 10 · ✓ 23',
        '⭐ 🟩🟩🟩🟩⬛⬛ First try!',
        'Gen 5 OU · Streak reset',
        '✅ 🟩🟩⬛⬛⬛⬛ Won on try 2',
        'Gen 6 OU · Streak reset',
        '❌ ⬛⬛⬛⬛⬛⬛ Not cleared yet · 1 try',
        'https://battle.example/#daily',
      ].join('\n'),
    );
  });

  it('lists each difficulty played today in a game’s own share', () => {
    const easy = game('Gen 4 OU', [a('win', 5)], 3, 'easy', { firstTries: 4, clears: 6 });
    const normal = game('Gen 4 OU', [], 0);
    const hard = shareModel({
      day: DAY,
      summary: summarizeDay(
        { swapUsed: false, attempts: [{ ...a('loss', 0), difficulty: 'hard' }] },
        true,
        'hard',
      ),
      streak: 0,
      game: 'Gen 4 OU',
      difficulty: 'hard',
    });
    // One difficulty is that difficulty's own share.
    expect(shareGame([easy, normal], easy)).toBe(easy);
    const both = shareGame([easy, normal, hard], easy)!;
    expect(isShareGame(both) && both.team).toEqual(easy.team);
    expect(anyShareText(both)).toBe(
      [
        'Pokémon Daily · Gen 4 OU · Oct 21',
        'Easy · 🔥 3-day streak · ⭐ 4 · ✓ 6',
        '⭐ 🟩🟩🟩🟩🟩⬛ First try!',
        'Hard · Streak reset',
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
