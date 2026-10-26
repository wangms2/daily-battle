// Lesson content check (docs/plan-tutorial-coach.md, step 4): for every quiz,
// how each answer plays out against the lesson's own foe, to find any "best"
// answer that doesn't win at least as often as an alternative.
//   pnpm --filter @daily-battle/tutorial exec tsx scripts/quiz-audit.ts [runs]
import { answerOutcomes, LESSONS } from '../src';

const runs = Number(process.argv[2] ?? 60);
const RANK = { best: 2, ok: 1, wrong: 0 } as const;
const pct = (x: number) => `${Math.round(100 * x)}%`;
for (const lesson of LESSONS.gen3ou ?? []) {
  for (const [n, step] of lesson.steps.entries()) {
    if (step.kind !== 'quiz') continue;
    const out = answerOutcomes(lesson.format, step, runs);
    const rows = step.answers.map((a, i) => ({ ...a, ...out[i]! }));
    const best = rows.filter((r) => r.grade === 'best');
    // A lower-graded answer that wins clearly more often (2 SE of the difference) is a problem.
    const se = (p: number, q: number) => Math.sqrt((p * (1 - p) + q * (1 - q)) / runs);
    const bad = rows.filter((r) =>
      best.some((b) => RANK[r.grade] < RANK[b.grade] && r.wins - b.wins > 2 * se(r.wins, b.wins)),
    );
    const flag = bad.length
      ? 'PROBLEM'
      : best.some((b) => rows.some((r) => r.wins > b.wins))
        ? 'close'
        : 'ok';
    console.log(
      `${flag.padEnd(8)}${lesson.id} step ${n + 1} [${step.check ?? 'none'}]: ` +
        rows.map((r) => `${r.choice} (${r.grade}) ${pct(r.wins)}`).join(', '),
    );
  }
}
