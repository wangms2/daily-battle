export { battleInput, foePolicy, startPosition } from './battle';
export { gen3Lessons, LESSONS } from './lessons';
export { monSet, teamOf } from './teams';
export type * from './types';
export { answerDamage, answerOutcomes, lessonProblems, type Outcome } from './validate';
export {
  Coach,
  noEffectText,
  type CoachNote,
  type CoachRule,
  type CoachTurn,
} from './coach/simple';
export {
  explainWarning,
  winningAnyway,
  type Explanation,
  type WarningReason,
} from './coach/explain';
export { Judge, JUDGE_DEFAULTS, type JudgeOptions, type Verdict } from './coach/judge';
export {
  buildReview,
  type Decision,
  type Heeded,
  type Review,
  type ReviewTurn,
} from './coach/review';
