// Day results, streaks, and stats (DESIGN.md §4.4), derived from the saved
// attempts rather than stored, so they can't drift out of sync.
//
// The streak counts days won on the first try: a first-try loss (giving up
// counts) breaks it straight away, and so does a missed day. Tries 2–3 can still
// clear the day and count toward the win rate; tries after that are practice.
import { addDays } from '@daily-battle/gen/dates';
import type { Attempt, DayState } from '../state/schema';

/** Tries that count toward the day's result (and the win rate). */
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

const cleared = (s: DayStatus) => s === 'firstTry' || s === 'won';
/** Played but not won on the first try: the streak is over. */
const breaks = (s: DayStatus) => s !== 'none' && s !== 'firstTry';

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
    if (cleared(s.status)) wins++;
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

/** "🔥 5-day streak", "Streak reset" once today's first try is lost, or nothing. */
export function streakLine(s: DaySummary, streak: number): string {
  if (breaks(s.status)) return 'Streak reset';
  return streak > 0 ? `🔥 ${streak}-day streak` : '';
}

/** Whether today's play has ended the streak (any day not won on the first try). */
export const streakBroken = (s: DaySummary) => breaks(s.status);
