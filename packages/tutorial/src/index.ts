export { battleSession, foePolicy, playBattle, setStartHp, startPosition } from './battle';
export {
  guideKey,
  guideNote,
  guideSwitch,
  lessonJudge,
  winCheck,
  type WinCheck,
} from './coach/guide';
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
  behind,
  choiceKey,
  Judge,
  JUDGE_DEFAULTS,
  LESSON_TIE,
  READ_MARGIN,
  replyKey,
  soundPick,
  type FoeRead,
  type CoachJudge,
  type JudgeOptions,
  type ReadValue,
  type Verdict,
} from './coach/judge';
export { NetJudge, NET_JUDGE_DEFAULTS, type NetJudgeOptions } from './coach/net-judge';
export {
  buildReview,
  type Decision,
  type Heeded,
  type Review,
  type ReviewTurn,
} from './coach/review';
export type { AdvancedReview } from './coach/advanced/review';
export { advancedTips, type AdvancedFind, type AdvancedRule } from './coach/advanced/coach';
