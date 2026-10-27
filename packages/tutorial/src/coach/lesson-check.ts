// Lesson content against the coach (docs/plan-tutorial-coach.md, step 4b): a
// practice position passes when its best answer is the judge's top choice,
// wins clearly more often in rollouts against the lesson's foe, and every
// wrong answer is clearly worse for a reason taught by that lesson (so the
// decision stays in scope). The player is told what the foe is, so the facts
// and the judge know the lesson foe's real set here.
import { aiFor, strongBot, turnFacts } from '@daily-battle/ai';
import type { Engine } from '@daily-battle/engine-wasm';
import {
  deriveSeed,
  legalChoices,
  makeRng,
  resolveStep,
  type Policy,
} from '@daily-battle/sim-bridge';
import { playBattle, startPosition } from '../battle';
import { knownSets, withLessonSets } from '../teams';
import type { BattleStep, PracticeStep } from '../types';
import { answerOutcomes } from '../validate';
import { TIP_LESSON } from './course';
import { explainWarning, inScope, type WarningReason } from './explain';
import { Judge, LESSON_TIE } from './judge';
import { Coach, type CoachRule } from './simple';

export interface PracticeRow {
  answer: string;
  grade: string;
  /** Share of rollouts won after this answer. */
  wins: number;
  /** The judge's gap to its top choice. */
  gap: number;
  worse: boolean;
  /** The coach's reason, within the lessons taught so far. */
  reason?: WarningReason;
}

/** How far a wrong answer's win rate must trail the best answer's. */
const CLEAR = 0.1;

/** A practice step's rows and problems (empty when it passes). */
export function practiceCheck(
  engine: Engine,
  format: string,
  step: PracticeStep,
  lesson: number,
  runs = 60,
): { rows: PracticeRow[]; problems: string[] } {
  const known = knownSets(format, step.position.p2);
  const told = withLessonSets(format, step.position.p2);
  const view = startPosition(format, step.position).view('p1')!;
  const facts = turnFacts(view, told);
  const judge = new Judge(engine, told, { knownSets: known, tie: LESSON_TIE });
  judge.begin(view, `lesson:${step.position.seed}`);
  const outcomes = answerOutcomes(format, step, runs);
  const best = step.answers.findIndex((a) => a.grade === 'best');
  const problems: string[] = [];
  const rows = step.answers.map((a, i): PracticeRow => {
    const choice = resolveStep(a.choice, view.request)!;
    const v = judge.settle(choice, Infinity);
    const e = v && explainWarning(view, facts, v, { taught: lesson });
    const wins = outcomes[i]!.wins;
    if (i !== best) {
      if (!v?.worse) problems.push(`${a.choice}: the judge doesn't find it clearly worse`);
      else if (!e) problems.push(`${a.choice}: no reason taught by lesson ${lesson} explains it`);
      if (a.grade === 'wrong' && wins > outcomes[best]!.wins - CLEAR)
        problems.push(`${a.choice}: wins about as often as the best answer`);
    }
    return {
      answer: a.choice,
      grade: a.grade,
      wins,
      gap: v?.gap ?? NaN,
      worse: !!v?.worse,
      ...(e ? { reason: e.reason } : {}),
    };
  });
  if (judge.best !== resolveStep(step.answers[best]!.choice, view.request))
    problems.push(`the judge's top choice is ${judge.best}, not the best answer`);
  return { rows, problems };
}

/**
 * Out-of-scope pressure for a lesson battle: over `battles` games against its
 * foe, with players of several strengths, how often the full coach would warn
 * about a pick or give a tip whose idea a later lesson teaches (the lesson's
 * coach stays quiet then, so the decision rested on something untaught).
 * Returns the share of decisions, and the reasons seen.
 */
export function battlePressure(
  engine: Engine,
  format: string,
  step: BattleStep,
  lesson: number,
  battles = 6,
): { decisions: number; outOfScope: number; reasons: Record<string, number> } {
  // As in the app's lesson battles: the coach knows the lesson foe's sets.
  const data = withLessonSets(format, step.foe);
  const known = knownSets(format, step.foe);
  const reasons: Record<string, number> = {};
  let decisions = 0;
  let outOfScope = 0;
  const players = ['easy', 'normal', 'strong'] as const;
  for (let i = 0; i < battles; i++) {
    const kind = players[i % players.length]!;
    const bot =
      kind === 'strong' ? strongBot({ data }) : aiFor({ difficulty: kind, style: 'balance', data });
    const full = new Coach(data, format, 'easy');
    const judge = new Judge(engine, data, { iterations: 8000, knownSets: known, tie: LESSON_TIE });
    const player: Policy = {
      choose(view, rng) {
        const choice = bot.choose(view, rng);
        if (view.request.requestType === 'move' && legalChoices(view.request).length > 1) {
          decisions++;
          const t = full.turn(view);
          judge.begin(view, `pressure:${i}:${decisions}`);
          const v = judge.settle(choice, Infinity);
          const tip =
            t.tip ?? (t.pending && judge.best ? full.confirm(view, judge.best) : undefined);
          const w = v && full.warn(view, v);
          let out = false;
          if (tip && (TIP_LESSON[tip.rule as CoachRule] ?? Infinity) > lesson) {
            reasons[tip.rule] = (reasons[tip.rule] ?? 0) + 1;
            out = true;
          }
          if (w && v) {
            const e = explainWarning(view, turnFacts(view, data), v);
            if (e && !inScope(e, lesson)) {
              reasons[e.reason] = (reasons[e.reason] ?? 0) + 1;
              out = true;
            }
          }
          if (out) outOfScope++;
          full.record(view, choice, w ?? null, v);
        }
        return choice;
      },
    };
    const rng = makeRng(deriveSeed(`${step.seed}:pressure:${i}`, 1));
    playBattle(format, step, (view) => player.choose(view, rng), `${step.seed}:pressure:${i}`);
  }
  return { decisions, outOfScope, reasons };
}
