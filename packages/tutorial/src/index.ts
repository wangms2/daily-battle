export { battleInput, foePolicy, startPosition } from './battle';
export { gen3Lessons, LESSONS } from './lessons';
export { knownSets, monSet, teamOf, withLessonSets } from './teams';
export type * from './types';
export { answerOutcomes, lessonProblems, type Outcome } from './validate';
export {
  Coach,
  noEffectText,
  type CoachNote,
  type CoachRule,
  type CoachTurn,
} from './coach/simple';
export {
  explainWarning,
  QUIET_REASONS,
  winningAnyway,
  type Explanation,
  type WarningReason,
} from './coach/explain';
export {
  agreement,
  Judge,
  JUDGE_DEFAULTS,
  LESSON_TIE,
  type JudgeOptions,
  type Verdict,
} from './coach/judge';
export {
  buildReview,
  type Decision,
  type Heeded,
  type Review,
  type ReviewTurn,
} from './coach/review';
