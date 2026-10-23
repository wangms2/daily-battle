import { describe, expect, it } from 'vitest';
import type { Attempt, DayState } from '../state/schema';
import { computeStats, summarizeDay } from './results';

const TODAY = '2026-10-21';
const attempt = (result: Attempt['result'], remaining = 0): Attempt => ({
  result,
  remaining,
  ts: 1,
  lead: 'Heatran',
  team: [],
  battleSeed: '1',
  aiSeed: '2',
  choices: [],
  engine: 'e',
});
const W = attempt('win', 3);
const L = attempt('loss');
const F = attempt('forfeit', 2);
const day = (...attempts: Attempt[]): DayState => ({ swapUsed: false, attempts });
/** Days ending today, oldest first; `null` is a missed day. */
function history(...ds: (DayState | null)[]): Record<string, DayState> {
  const out: Record<string, DayState> = {};
  ds.forEach((d, i) => {
    const date = new Date(`${TODAY}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - (ds.length - 1 - i));
    if (d) out[date.toISOString().slice(0, 10)] = d;
  });
  return out;
}
const streak = (...ds: (DayState | null)[]) => computeStats(history(...ds), TODAY).streak;

describe('day status', () => {
  it('reads a day from its finished tries', () => {
    expect(summarizeDay(undefined, true).status).toBe('none');
    expect(summarizeDay(day(attempt('inProgress')), true).status).toBe('none');
    expect(summarizeDay(day(W), true).status).toBe('firstTry');
    expect(summarizeDay(day(L, L, W), true)).toMatchObject({ status: 'won', winTry: 3 });
    // There's no limit on tries: today stays open until it's won.
    expect(summarizeDay(day(L, F), true).status).toBe('pending');
    expect(summarizeDay(day(L, L, L, L, L), true).status).toBe('pending');
    // A past day that was never won is over.
    expect(summarizeDay(day(L, F), false).status).toBe('failed');
    // A late win clears the day but doesn't keep the streak.
    expect(summarizeDay(day(L, L, F, W), true)).toMatchObject({ status: 'won', winTry: 4 });
  });
});

describe('streak (first tries)', () => {
  it('counts tries only up to the first win; the rest are practice', () => {
    expect(summarizeDay(day(W, L, W), true).counted).toHaveLength(1);
    expect(summarizeDay(day(L, W, L), true).counted).toHaveLength(2);
    expect(summarizeDay(day(L, L, L, L, L, L, W, L), true).counted).toHaveLength(7);
    expect(summarizeDay(day(L, L, L, L), true).counted).toHaveLength(4);
  });

  it('extends only with a first-try win', () => {
    expect(streak(day(W), day(W), day(W))).toBe(3);
    expect(streak(day(W), day(L, W), day(W))).toBe(1);
    expect(streak(day(W), day(L, L, W))).toBe(0);
  });

  it('resets on a first-try loss, giving up included, as soon as it happens', () => {
    expect(streak(day(W), day(W), day(L))).toBe(0);
    expect(streak(day(W), day(W), day(F))).toBe(0);
    expect(streak(day(W), day(W), day(L, W))).toBe(0);
  });

  it('resets after a missed day', () => {
    expect(streak(day(W), day(W), null, day(W))).toBe(1);
    // Yesterday missed, today not played yet.
    expect(streak(day(W), day(W), null, null)).toBe(0);
  });

  it('keeps yesterday’s streak while today is unplayed', () => {
    expect(streak(day(W), day(W), null)).toBe(2);
    const h = history(day(W), day(W));
    expect(computeStats(h, '2026-10-22').streak).toBe(2);
  });

  it('ignores a battle still in progress', () => {
    expect(streak(day(W), day(attempt('inProgress')))).toBe(1);
  });
});

describe('stats', () => {
  it('counts first tries, clears, first-try rate, best streak, and tries per clear', () => {
    const stats = computeStats(
      history(day(W), day(L, W), day(W), null, day(L, L, L, L, W), day(W), day(L)),
      TODAY,
    );
    expect(stats).toEqual({
      streak: 0, // today's first try was lost
      bestStreak: 1, // no two first-try wins on consecutive days
      firstTryWins: 3,
      daysPlayed: 6,
      firstTryRate: 50, // 3 of 6 days played
      clears: 5,
      triesPerClear: (1 + 2 + 1 + 5 + 1) / 5,
    });
  });

  it('starts at zero', () => {
    expect(computeStats({}, TODAY)).toEqual({
      streak: 0,
      bestStreak: 0,
      firstTryWins: 0,
      daysPlayed: 0,
      firstTryRate: 0,
      clears: 0,
      triesPerClear: null,
    });
  });
});
