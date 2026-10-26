// The coach-eval report (docs/plan-tutorial-coach.md, step 4): from one or
// more `coach-eval --out` files, a Markdown table of the warnings shown by
// reason and difficulty (gain from following the advice, its 95% CI, and the
// share clearly worse), then the worst cases with their position and text.
//   pnpm --filter @daily-battle/tutorial exec tsx scripts/eval-report.ts <out.json>... [--worst 15] > report.md
import { readFileSync } from 'node:fs';

interface Result {
  battle: number;
  turn: number;
  warned: string;
  alt: string;
  rule?: string;
  text?: string;
  position: string;
  gap: number;
  a: number;
  b: number;
  diff: number;
  se: number;
}

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const WORST = Number(arg('worst') ?? 15);
const files = process.argv
  .slice(2)
  .filter((a, i, all) => !a.startsWith('--') && !all[i - 1]?.startsWith('--'));
const runs = files.map(
  (f) => JSON.parse(readFileSync(f, 'utf8')) as { vs: string; R: number; results: Result[] },
);

const pts = (x: number) => `${x >= 0 ? '+' : ''}${(100 * x).toFixed(1)}`;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
function row(rs: Result[]) {
  const d = mean(rs.map((r) => r.diff));
  const sd = Math.sqrt(
    mean(rs.map((r) => (r.diff - d) ** 2)) * (rs.length / Math.max(1, rs.length - 1)),
  );
  const ci = (1.96 * sd) / Math.sqrt(Math.max(1, rs.length));
  const worse = rs.filter((r) => r.diff < -2 * r.se).length;
  return {
    n: rs.length,
    gain: d,
    lo: d - ci,
    hi: d + ci,
    worse: worse / Math.max(1, rs.length),
  };
}
const cell = (r: ReturnType<typeof row>) =>
  r.n
    ? `${pts(r.gain)} (${pts(r.lo)} to ${pts(r.hi)}), ${r.n}, ${(100 * r.worse).toFixed(1)}%`
    : '—';

const reasons = [...new Set(runs.flatMap((r) => r.results.map((x) => x.rule ?? '(none)')))].sort();
const out: string[] = [];
out.push('# Coach eval: warnings shown, by reason\n');
out.push(
  `Each case: a warning the coach shows, rolled out ${runs.map((r) => `${r.R}× per branch vs ${r.vs}`).join(', ')} with the real opponent AI. ` +
    'Cells: gain in win-rate points from following the advice (95% CI), cases, share clearly worse (by more than 2 SE).\n',
);
out.push(`| reason | ${runs.map((r) => r.vs).join(' | ')} |`);
out.push(`| --- | ${runs.map(() => '---').join(' | ')} |`);
for (const reason of reasons)
  out.push(
    `| ${reason} | ${runs.map((r) => cell(row(r.results.filter((x) => (x.rule ?? '(none)') === reason)))).join(' | ')} |`,
  );
out.push(`| **all** | ${runs.map((r) => cell(row(r.results))).join(' | ')} |`);
out.push('\n## Worst cases\n');
const all = runs.flatMap((r) => r.results.map((x) => ({ ...x, vs: r.vs })));
for (const r of all.sort((x, y) => x.diff - y.diff).slice(0, WORST))
  out.push(
    `- **${r.rule ?? '?'}** vs ${r.vs}, battle ${r.battle} turn ${r.turn}: ${r.position} (judged gap ${r.gap.toFixed(2)})\n` +
      `  "${r.text ?? ''}"\n` +
      `  following it (${r.alt}) ${Math.round(100 * r.a)}% vs the pick (${r.warned}) ${Math.round(100 * r.b)}%: ${pts(r.diff)} ± ${(196 * r.se).toFixed(0)}`,
  );
console.log(out.join('\n'));
