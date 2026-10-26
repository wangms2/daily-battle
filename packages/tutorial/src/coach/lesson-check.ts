// Lesson content against the coach (docs/plan-tutorial-coach.md, step 4b): a
// practice position passes when its best answer is the judge's top choice,
// wins clearly more often in rollouts against the lesson's foe, and every
// wrong answer is clearly worse for a reason taught by that lesson (so the
// decision stays in scope). The player is told what the foe is, so the facts
// and the judge know the lesson foe's real set here.
import { turnFacts } from '@daily-battle/ai';
import { setsFor, type SetsFile } from '@daily-battle/data';
import type { Engine } from '@daily-battle/engine-wasm';
import { resolveStep } from '@daily-battle/sim-bridge';
import { startPosition } from '../battle';
import { knownSets } from '../teams';
import type { PracticeStep } from '../types';
import { answerOutcomes } from '../validate';
import { explainWarning, type WarningReason } from './explain';
import { Judge } from './judge';

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
  const data = setsFor(format);
  const known = knownSets(format, step.position.p2);
  const told: SetsFile = {
    ...data,
    species: {
      ...data.species,
      ...Object.fromEntries(
        Object.entries(known).map(([name, set]) => [name, { ...data.species[name]!, sets: [set] }]),
      ),
    },
  };
  const view = startPosition(format, step.position).view('p1')!;
  const facts = turnFacts(view, told);
  const judge = new Judge(engine, told, { knownSets: known });
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
