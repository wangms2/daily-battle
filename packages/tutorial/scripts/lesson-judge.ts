// Lesson check against the coach's judge (docs/plan-tutorial-coach.md, step
// 4b): is each quiz's "best" answer the judge's top choice (or not clearly
// worse than it), and is each action a scripted lesson battle's intended line
// takes on a prompted turn? Practice steps (the redesigned course) must also
// stay in scope: the best answer is the judge's top choice and wins clearly
// more often in rollouts, and every wrong answer is clearly worse for a reason
// taught by that lesson.
//   pnpm --filter @daily-battle/tutorial exec tsx scripts/lesson-judge.ts [--json out.json]
import { writeFileSync } from 'node:fs';
import { setsFor } from '@daily-battle/data';
import { loadEngine } from '@daily-battle/engine-wasm/node';
import { resolveStep, runBattle, ScriptedPolicy, type Policy } from '@daily-battle/sim-bridge';
import { battleInput, LESSONS, startPosition } from '../src';
import { practiceCheck } from '../src/coach/lesson-check';
import { Judge } from '../src/coach/judge';

const engine = loadEngine(3);
const data = setsFor('gen3ou');
const out: unknown[] = [];
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};

const only = arg('lesson');
for (const lesson of LESSONS.gen3ou ?? []) {
  if (only && lesson.id !== only) continue;
  for (const [n, step] of lesson.steps.entries()) {
    const where = `${lesson.id} step ${n + 1}`;
    if (step.kind === 'quiz') {
      const view = startPosition(lesson.format, step.position).view('p1')!;
      const judge = new Judge(engine, data);
      judge.begin(view, `lesson:${where}`);
      const rows = step.answers.map((a) => {
        const choice = resolveStep(a.choice, view.request)!;
        const v = judge.settle(choice, Infinity);
        return { answer: a.choice, grade: a.grade, choice, gap: v?.gap ?? NaN, worse: v?.worse };
      });
      const top = judge.best;
      const topAnswer = rows.find((r) => r.choice === top)?.answer ?? `${top} (not an answer)`;
      const best = rows.filter((r) => r.grade === 'best');
      const ok = best.every((b) => b.choice === top || !b.worse);
      console.log(
        `${ok ? 'ok     ' : 'PROBLEM'} ${where} quiz: judge's top ${topAnswer}; ` +
          rows
            .map(
              (r) => `${r.answer} (${r.grade}) gap ${r.gap.toFixed(2)}${r.worse ? ' worse' : ''}`,
            )
            .join(', '),
      );
      out.push({ lesson: lesson.id, step: n + 1, kind: 'quiz', top: topAnswer, ok, rows });
    } else if (step.kind === 'practice') {
      const { rows, problems } = practiceCheck(engine, lesson.format, step, lesson.number);
      console.log(
        `${problems.length ? 'PROBLEM' : 'ok     '} ${where} practice: ` +
          rows
            .map(
              (r) =>
                `${r.answer} (${r.grade}) wins ${Math.round(100 * r.wins)}% gap ${r.gap.toFixed(2)}${r.reason ? ` [${r.reason}]` : ''}`,
            )
            .join(', ') +
          problems
            .map(
              (p) => `
          ${p}`,
            )
            .join(''),
      );
      out.push({ lesson: lesson.id, step: n + 1, kind: 'practice', problems, rows });
    } else if (step.kind === 'battle' && step.intended) {
      const script = new ScriptedPolicy(step.intended);
      const prompted = new Set(step.prompts.map((p) => p.turn));
      const checks: { turn: number; choice: string; top?: string; gap: number; worse?: boolean }[] =
        [];
      const player: Policy = {
        choose(view, rng) {
          const choice = script.choose(view, rng);
          const turn = view.battle.turn;
          if (prompted.has(turn) && view.request.requestType === 'move') {
            const judge = new Judge(engine, data);
            judge.begin(view, `lesson:${where}:${turn}`);
            const v = judge.settle(choice, Infinity);
            checks.push({ turn, choice, top: judge.best, gap: v?.gap ?? NaN, worse: v?.worse });
          }
          return choice;
        },
      };
      runBattle(battleInput(lesson.format, step, player));
      for (const c of checks)
        console.log(
          `${c.worse ? 'PROBLEM' : 'ok     '} ${where} battle turn ${c.turn}: intended ${c.choice}, judge's top ${c.top}, gap ${c.gap.toFixed(2)}`,
        );
      out.push({ lesson: lesson.id, step: n + 1, kind: 'battle', checks });
    }
  }
}
const json = arg('json');
if (json) writeFileSync(json, JSON.stringify(out, null, 1));
