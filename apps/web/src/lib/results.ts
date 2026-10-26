// Day results, streaks, and stats (DESIGN.md §4.4), derived from the saved
// attempts rather than stored, so they can't drift out of sync.
//
// The streak counts days won on the first try: a first-try loss (giving up
// counts) breaks it straight away, and so does a missed day. There's no limit
// on tries: every try counts until the day is won, and runs after a win are
// practice.
//
// Coached tries (DESIGN.md §22) have a bucket of their own, shared across
// difficulties. A coached try before the day is cleared ends that difficulty's
// regular streak; coached practice after a clear doesn't.
import type { Difficulty } from '@daily-battle/ai/version';
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
  /** A regular day the coach helped with (a coached try before the clear): no streak. */
  helped: boolean;
}

/** Each difficulty's own tries and streak, or the coached ones (any difficulty). */
export type Bucket = Difficulty | 'coached';

const won = (a: Attempt) => a.result === 'win';

/** Attempts saved before difficulties (and all Normal ones) have none. */
export const attemptDifficulty = (a: Pick<Attempt, 'difficulty'>): Difficulty =>
  a.difficulty ?? 'normal';

export const attemptBucket = (a: Pick<Attempt, 'difficulty' | 'coached'>): Bucket =>
  a.coached ? 'coached' : attemptDifficulty(a);

/** One bucket's day: each has its own tries, first try, and streak (§4.4). */
export function summarizeDay(
  day: DayState | undefined,
  isToday: boolean,
  bucket: Bucket = 'normal',
): DaySummary {
  const attempts = day?.attempts ?? [];
  const tries = attempts.filter((a) => a.result !== 'inProgress' && attemptBucket(a) === bucket);
  const first = tries.findIndex(won);
  const winTry = first >= 0 ? first + 1 : null;
  const counted = winTry === null ? tries : tries.slice(0, winTry);
  const clearedAt = winTry === null ? Infinity : tries[first]!.ts;
  const helped =
    bucket !== 'coached' &&
    attempts.some((a) => a.coached && attemptDifficulty(a) === bucket && a.ts < clearedAt);
  let status: DayStatus;
  if (!tries.length) status = 'none';
  else if (winTry === 1 && !helped) status = 'firstTry';
  else if (winTry !== null) status = 'won';
  else status = isToday ? 'pending' : 'failed';
  return { status, tries, counted, winTry, helped };
}

/** Played but not won on the first try (or with the coach's help): the streak is over. */
const breaks = (s: DaySummary) => s.helped || (s.status !== 'none' && s.status !== 'firstTry');

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

export function computeStats(
  days: Record<string, DayState>,
  today: string,
  bucket: Bucket = 'normal',
): Stats {
  // A ditched team ends the streak, even on a first-try win or before any try.
  // The team is shared, so that's every bucket's streak. So does the coach's help.
  const status = (key: string): DayStatus => {
    const s = summarizeDay(days[key], key === today, bucket);
    if (!days[key]?.ditched && !s.helped) return s.status;
    return s.status === 'none' || s.status === 'firstTry' ? 'pending' : s.status;
  };

  // Streak: back from today. A day not played yet doesn't break yesterday's.
  let streak = 0;
  const t = status(today);
  if (t === 'none' || t === 'firstTry') {
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
    const s = summarizeDay(days[key], key === today, bucket);
    if (s.status === 'none') {
      if (days[key]?.ditched || s.helped) {
        run = 0;
        prev = null;
      }
      continue;
    }
    daysPlayed++;
    if (s.status === 'firstTry') firstTryWins++;
    if (s.winTry !== null) {
      clears++;
      triesToClear += s.winTry;
    }
    if (status(key) === 'firstTry') {
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
  if (breaks(s)) return 'Streak reset';
  return streak > 0 ? `🔥 ${streak}-day streak` : '';
}

/** Whether today's play has ended the streak (any day not won on the first try). */
export const streakBroken = (s: DaySummary) => breaks(s);
