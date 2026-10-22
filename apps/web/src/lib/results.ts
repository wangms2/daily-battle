// Day results, streaks, and stats (DESIGN.md §4.4), derived from the saved
// attempts rather than stored, so they can't drift out of sync.
//
// A day counts toward the streak if it's won within the first 3 tries; the 3rd
// loss (giving up counts) breaks it straight away, and so does a missed day.
// Tries after that are practice. A first-try win is the best result.
import { addDays } from '@daily-battle/gen/dates';
import type { Attempt, DayState } from '../state/schema';

/** Tries that count toward the streak each day. */
export const COUNTED_TRIES = 3;

export type DayStatus =
  /** Not played (or only a battle in progress). */
  | 'none'
  /** Today, fewer than 3 tries and none won yet. */
  | 'pending'
  | 'firstTry'
  /** Won on try 2 or 3. */
  | 'won'
  /** Not won within 3 tries (or a past day that wasn't). */
  | 'failed';

export interface DaySummary {
  status: DayStatus;
  /** Finished tries, in order. */
  tries: Attempt[];
  /** The tries that count: up to the first win, at most 3. Later ones are practice. */
  counted: Attempt[];
  /** 1-based try of the day's first win, if any (it may be a practice try). */
  winTry: number | null;
  /** Tries that can still count today. */
  triesLeft: number;
}

const won = (a: Attempt) => a.result === 'win';

export function summarizeDay(day: DayState | undefined, isToday: boolean): DaySummary {
  const tries = (day?.attempts ?? []).filter((a) => a.result !== 'inProgress');
  const first = tries.findIndex(won);
  const winTry = first >= 0 ? first + 1 : null;
  const counted = tries.slice(0, Math.min(winTry ?? COUNTED_TRIES, COUNTED_TRIES));
  let status: DayStatus;
  if (!tries.length) status = 'none';
  else if (winTry === 1) status = 'firstTry';
  else if (winTry !== null && winTry <= COUNTED_TRIES) status = 'won';
  else if (counted.length >= COUNTED_TRIES || !isToday) status = 'failed';
  else status = 'pending';
  return {
    status,
    tries,
    counted,
    winTry,
    triesLeft: status === 'pending' ? COUNTED_TRIES - counted.length : 0,
  };
}

const keeps = (s: DayStatus) => s === 'firstTry' || s === 'won';

export interface Stats {
  streak: number;
  bestStreak: number;
  firstTryWins: number;
  /** Days with at least one finished try. */
  daysPlayed: number;
  /** Share of decided days won within 3 tries, 0–100. */
  winRate: number;
  /** Days won at all, including on a practice try. */
  clears: number;
  /** Average tries to the first win, over cleared days; null with none. */
  triesPerClear: number | null;
}

export function computeStats(days: Record<string, DayState>, today: string): Stats {
  const status = (key: string) => summarizeDay(days[key], key === today).status;

  // Streak: back from today. Today only counts once it's decided; a day not yet
  // played (or still in its 3 tries) doesn't break yesterday's streak.
  let streak = 0;
  const t = status(today);
  if (t !== 'failed') {
    let d = keeps(t) ? today : addDays(today, -1);
    while (keeps(status(d))) {
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
  let decided = 0;
  let wins = 0;
  let clears = 0;
  let triesToClear = 0;
  for (const key of keys) {
    const s = summarizeDay(days[key], key === today);
    if (s.status === 'none') continue;
    daysPlayed++;
    if (s.status === 'firstTry') firstTryWins++;
    if (s.status !== 'pending') decided++;
    if (keeps(s.status)) wins++;
    if (s.winTry !== null) {
      clears++;
      triesToClear += s.winTry;
    }
    if (keeps(s.status)) {
      run = prev !== null && addDays(prev, 1) === key ? run + 1 : 1;
      prev = key;
      bestStreak = Math.max(bestStreak, run);
    } else if (s.status === 'failed') {
      run = 0;
      prev = null;
    }
  }

  return {
    streak,
    bestStreak: Math.max(bestStreak, streak),
    firstTryWins,
    daysPlayed,
    winRate: decided ? Math.round((100 * wins) / decided) : 0,
    clears,
    triesPerClear: clears ? triesToClear / clears : null,
  };
}

/** "⭐ First try! · 4/6 left", "✅ Won on try 2 · 3/6 left", … */
export function dayHeadline(s: DaySummary): string {
  const win = s.winTry !== null ? s.tries[s.winTry - 1] : undefined;
  if (s.status === 'firstTry') return `⭐ First try! · ${win!.remaining}/6 left`;
  if (win) return `✅ Won on try ${s.winTry} · ${win.remaining}/6 left`;
  if (s.status === 'failed') return '❌ Not cleared in 3 tries';
  if (s.status === 'pending') return `Not cleared yet · ${s.counted.length} of 3 tries`;
  return 'Not played yet';
}

/** "🔥 5-day streak", "Streak reset", or a nudge while today's tries still count. */
export function streakLine(s: DaySummary, streak: number): string {
  if (s.status === 'failed') return 'Streak reset';
  if (s.status === 'pending') {
    const left = `${s.triesLeft} ${s.triesLeft === 1 ? 'try' : 'tries'} left`;
    return streak > 0
      ? `🔥 ${streak}-day streak · ${left} to keep it`
      : `${left} to start a streak`;
  }
  return streak > 0 ? `🔥 ${streak}-day streak` : '';
}
