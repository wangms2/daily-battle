// An account's progress in each game, read from its save (the app's State,
// DESIGN.md §10) with the app's own streak rules (lib/results.ts), so the admin
// page shows what the player sees.
import type { Difficulty } from '@daily-battle/ai/version';
import { dayKey } from '@daily-battle/gen/dates';
import { computeStats } from '../../web/src/lib/results';
import type { GameState, State } from '../../web/src/state/schema';

export interface ProgressRow {
  format: string;
  daysPlayed: number;
  /** The player's local date of their last finished try. */
  lastDay: string | null;
  /** Finished tries won and lost (giving up counts as lost). */
  wins: number;
  losses: number;
  clears: number;
  firstTryWins: number;
  /** In the difficulty they've picked for the game. */
  streak: number;
  bestStreak: number;
  difficulty: Difficulty;
  coach: boolean;
  lessons: number;
}

/** One row per game the player has played or taken lessons in; none for a bad save. */
export function progressRows(save: string, now: number): ProgressRow[] {
  let state: Partial<State>;
  try {
    state = JSON.parse(save) as Partial<State>;
  } catch {
    return [];
  }
  const games: Partial<Record<string, GameState>> = state.games ?? {};
  const settings = state.settings;
  const rows: ProgressRow[] = [];
  for (const [format, game] of Object.entries(games)) {
    const days = game?.days ?? {};
    let wins = 0;
    let losses = 0;
    let lastDay: string | null = null;
    for (const [key, day] of Object.entries(days)) {
      const done = (day?.attempts ?? []).filter((a) => a.result !== 'inProgress');
      if (!done.length) continue;
      wins += done.filter((a) => a.result === 'win').length;
      losses += done.length - done.filter((a) => a.result === 'win').length;
      if (!lastDay || key > lastDay) lastDay = key;
    }
    const lessons =
      settings?.tutorial?.[format as keyof typeof settings.tutorial]?.completed.length ?? 0;
    if (!lastDay && !lessons) continue;
    const difficulty =
      settings?.difficulty?.[format as keyof typeof settings.difficulty] ?? 'normal';
    // The player's own today isn't known here: it's the server's date, or a later
    // one if they've played on it (they're ahead of UTC).
    const utc = dayKey(new Date(now));
    const today = lastDay && lastDay > utc ? lastDay : utc;
    const stats = computeStats(days, today, difficulty);
    rows.push({
      format,
      daysPlayed: Object.values(days).filter((d) =>
        (d?.attempts ?? []).some((a) => a.result !== 'inProgress'),
      ).length,
      lastDay,
      wins,
      losses,
      clears: stats.clears,
      firstTryWins: stats.firstTryWins,
      streak: stats.streak,
      bestStreak: stats.bestStreak,
      difficulty,
      coach: !!settings?.coach?.[format as keyof typeof settings.coach],
      lessons,
    });
  }
  return rows;
}
