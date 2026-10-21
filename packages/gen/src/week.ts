import { sets as defaultSets, type SetsFile } from '@daily-battle/data';
import { weekDays } from './dates';
import { generateOpponent, type DailyOpponent } from './opponent';
import { generatePool, type WeeklyPool } from './pool';

export interface GeneratedWeek {
  pool: WeeklyPool;
  /** Monday first. */
  opponents: DailyOpponent[];
}

/** The pool and all seven daily opponents for a week; what M5's schedule files hold. */
export function generateWeek(week: string, data: SetsFile = defaultSets): GeneratedWeek {
  return {
    pool: generatePool(week, data),
    opponents: weekDays(week).map((day) => generateOpponent(day, data)),
  };
}
