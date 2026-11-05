// The daily coach (DESIGN.md §22): where it's offered, whether today's battle
// has it. Coached tries count like any other (lib/results.ts).
import type { Difficulty } from '@daily-battle/ai/version';
import type { FormatId } from '@daily-battle/data/formats';
import { attemptInProgress } from '../state/reducer';
import type { DayState, Settings } from '../state/schema';

/** The coach is offered in every game at Easy, Normal and Hard (the coach *is* Master's brain, so never there). */
export const coachAvailable = (_format: FormatId, difficulty: Difficulty) =>
  difficulty !== 'master';

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
