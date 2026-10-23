// Day results, streaks, and stats (DESIGN.md §4.4), derived from the saved
// attempts rather than stored, so they can't drift out of sync.
//
// The streak counts days won on the first try: a first-try loss (giving up
// counts) breaks it straight away, and so does a missed day. There's no limit
// on tries: every try counts until the day is won, and runs after a win are
// practice.
import { addDays } from '@daily-battle/gen/dates';
import type { Attempt, DayState } from '../state/schema';

export type DayStatus =
  /** Not played (or only a battle in progress). */
  | 'none'
  /** Today, tried but not won yet. */
  | 'pending'
  | 'firstTry'
  /** Won on a later try. */
  | 'won'
  /** A past day that was never won. */
  | 'failed';

export interface DaySummary {
  status: DayStatus;
  /** Finished tries, in order. */
  tries: Attempt[];
  /** The tries that count: all of them up to the first win. Later ones are practice. */
  counted: Attempt[];
  /** 1-based try of the day's first win, if any. */
  winTry: number | null;
}

const won = (a: Attempt) => a.result === 'win';

export function summarizeDay(day: DayState | undefined, isToday: boolean): DaySummary {
  const tries = (day?.attempts ?? []).filter((a) => a.result !== 'inProgress');
  const first = tries.findIndex(won);
  const winTry = first >= 0 ? first + 1 : null;
  const counted = winTry === null ? tries : tries.slice(0, winTry);
  let status: DayStatus;
  if (!tries.length) status = 'none';
  else if (winTry === 1) status = 'firstTry';
  else if (winTry !== null) status = 'won';
  else status = isToday ? 'pending' : 'failed';
  return { status, tries, counted, winTry };
}

/** Played but not won on the first try: the streak is over. */
const breaks = (s: DayStatus) => s !== 'none' && s !== 'firstTry';

export interface Stats {
  streak: number;
  bestStreak: number;
  firstTryWins: number;
  /** Days with at least one finished try. */
  daysPlayed: number;
  /** Share of days played that were won on the first try, 0–100. */
  firstTryRate: number;
  /** Days won, on any try. */
  clears: number;
  /** Average tries to the first win, over cleared days; null with none. */
  triesPerClear: number | null;
}

export function computeStats(days: Record<string, DayState>, today: string): Stats {
  const status = (key: string) => summarizeDay(days[key], key === today).status;

  // Streak: back from today. A day not played yet doesn't break yesterday's.
  let streak = 0;
  const t = status(today);
  if (!breaks(t)) {
    let d = t === 'firstTry' ? today : addDays(today, -1);
    while (status(d) === 'firstTry') {
      streak++;
      d = addDays(d, -1);
    }
  }

  const keys = Object.keys(days)
    .filter((k) => k <= today)
    .sort();
  let bestStreak = 0;
  let run = 0;
  let prev: string | null = null;
  let firstTryWins = 0;
  let daysPlayed = 0;
  let clears = 0;
  let triesToClear = 0;
  for (const key of keys) {
    const s = summarizeDay(days[key], key === today);
    if (s.status === 'none') continue;
    daysPlayed++;
    if (s.status === 'firstTry') firstTryWins++;
    if (s.winTry !== null) {
      clears++;
      triesToClear += s.winTry;
    }
    if (s.status === 'firstTry') {
      run = prev !== null && addDays(prev, 1) === key ? run + 1 : 1;
      prev = key;
      bestStreak = Math.max(bestStreak, run);
    } else {
      run = 0;
      prev = null;
    }
  }

  return {
    streak,
    bestStreak: Math.max(bestStreak, streak),
    firstTryWins,
    daysPlayed,
    firstTryRate: daysPlayed ? Math.round((100 * firstTryWins) / daysPlayed) : 0,
    clears,
    triesPerClear: clears ? triesToClear / clears : null,
  };
}

/** "1 try", "5 tries". */
export const tryCount = (n: number) => `${n} ${n === 1 ? 'try' : 'tries'}`;

/**
 * A long list of tries, shortened to its ends: the first (the one the streak
 * rides on), a count of the ones between, and the last `tail`. Lists up to
 * `max` long are kept whole.
 */
export function condenseTries<T>(items: T[], max: number, tail = 2): (T | { more: number })[] {
  if (items.length <= max) return items;
  return [items[0]!, { more: items.length - 1 - tail }, ...items.slice(-tail)];
}

/** "⭐ First try! · 4/6 left", "✅ Won on try 2 · 3/6 left", … */
export function dayHeadline(s: DaySummary): string {
  const win = s.winTry !== null ? s.tries[s.winTry - 1] : undefined;
  if (s.status === 'firstTry') return `⭐ First try! · ${win!.remaining}/6 left`;
  if (win) return `✅ Won on try ${s.winTry} · ${win.remaining}/6 left`;
  if (s.status === 'failed') return '❌ Not cleared';
  if (s.status === 'pending') return `Not cleared yet · ${tryCount(s.counted.length)}`;
  return 'Not played yet';
}

/** "🔥 5-day streak", "Streak reset" once today's first try is lost, or nothing. */
export function streakLine(s: DaySummary, streak: number): string {
  if (breaks(s.status)) return 'Streak reset';
  return streak > 0 ? `🔥 ${streak}-day streak` : '';
}

/** Whether today's play has ended the streak (any day not won on the first try). */
export const streakBroken = (s: DaySummary) => breaks(s.status);
