// The daily coach (DESIGN.md §22): where it's offered, whether today's battle
// has it, and what turning it on costs.
import type { Difficulty } from '@daily-battle/ai/version';
import type { FormatId } from '@daily-battle/data/formats';
import { attemptInProgress } from '../state/reducer';
import type { DayState, Settings } from '../state/schema';
import { DIFFICULTY_NAME } from './share';
import { summarizeDay, type Bucket } from './results';

/** Games with lessons for the coach's tips to link to. */
const COACHED_GAMES: FormatId[] = ['gen3ou'];

/** The coach is offered in Gen 3, below Hard (whose Advanced coach isn't built yet). */
export const coachAvailable = (format: FormatId, difficulty: Difficulty) =>
  COACHED_GAMES.includes(format) && difficulty !== 'hard';

/** Whether today's battle is coached: an unfinished battle's, or else the setting. */
export function coachOn(
  settings: Settings,
  format: FormatId,
  day: DayState | undefined,
  difficulty: Difficulty,
): boolean {
  const a = attemptInProgress(day);
  if (a) return !!a.coached;
  return coachAvailable(format, difficulty) && !!settings.coach?.[format];
}

/** Where today's tries and streak are counted. */
export const bucketOf = (difficulty: Difficulty, coached: boolean): Bucket =>
  coached ? 'coached' : difficulty;

/**
 * What turning the coach on costs today, or null when nothing: the day's regular
 * first try is still to come (already played, the streak is decided either way).
 */
export function coachWarning(
  day: DayState | undefined,
  difficulty: Difficulty,
  streak: number,
): string | null {
  const s = summarizeDay(day, true, difficulty);
  if (s.status !== 'none' || s.helped) return null;
  const level = difficulty === 'normal' ? '' : ` ${DIFFICULTY_NAME[difficulty]}`;
  const head =
    streak > 0
      ? `Turning on the coach ends your ${streak}-day${level} streak.`
      : 'Coached battles don’t count toward your regular streak.';
  return `${head} Coached wins build a Coached streak of their own.`;
}
