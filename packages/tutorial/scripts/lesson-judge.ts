// Lesson check against the coach's judge (docs/plan-tutorial-coach.md, step
// 4b). Practice steps stay in scope: the best answer is the judge's top choice
// and wins clearly more often in rollouts, and every wrong answer is clearly
// worse for a reason taught by that lesson. Lesson battles rarely leave the
// coach wanting to talk about a later lesson's idea.
//   pnpm --filter @daily-battle/tutorial exec tsx scripts/lesson-judge.ts [--json out.json]
import { writeFileSync } from 'node:fs';
import { loadEngine } from '@daily-battle/engine-wasm/node';
import { LESSONS } from '../src';
import { battlePressure, practiceCheck } from '../src/coach/lesson-check';

const engine = loadEngine(3);
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
    if (step.kind === 'practice') {
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
    } else if (step.kind === 'battle') {
      const p = battlePressure(engine, lesson.format, step, lesson.number);
      const share = p.outOfScope / Math.max(1, p.decisions);
      console.log(
        `${share > 0.05 ? 'PROBLEM' : 'ok     '} ${where} battle: ${p.outOfScope} of ${p.decisions} decisions out of scope (${Math.round(100 * share)}%) ${JSON.stringify(p.reasons)}`,
      );
      out.push({ lesson: lesson.id, step: n + 1, kind: 'battle', pressure: p });
    }
  }
}
const json = arg('json');
if (json) writeFileSync(json, JSON.stringify(out, null, 1));
