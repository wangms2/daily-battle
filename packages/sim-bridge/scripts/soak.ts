// Runs many RandomPolicy vs RandomPolicy battles on random teams from the set snapshot.
//   pnpm --filter @daily-battle/sim-bridge soak [--n 1000] [--seed soak]
// Exits non-zero if any battle errors; rerun a failure with the printed --seed and --only.
import { soak } from '../src/soak';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

const n = Number(arg('n') ?? 1000);
const seed = arg('seed') ?? 'soak';
const only = arg('only');

const t0 = performance.now();
const report = soak({ n, seed, only: only === undefined ? undefined : Number(only) });
const seconds = (performance.now() - t0) / 1000;

const { results, errors } = report;
const count = (reason: string) => results.filter((r) => r.endReason === reason).length;
const turns = results.map((r) => r.turns);
console.log(`Battles: ${results.length + errors.length} (seed "${seed}")`);
console.log(
  `p1 wins ${results.filter((r) => r.winner === 'p1').length}, ` +
    `p2 wins ${results.filter((r) => r.winner === 'p2').length}, ` +
    `ties ${count('tie')}, turn caps ${count('turnCap')}`,
);
if (turns.length) {
  const avg = turns.reduce((a, b) => a + b, 0) / turns.length;
  console.log(`Turns: avg ${avg.toFixed(1)}, max ${Math.max(...turns)}`);
}
console.log(
  `Time: ${seconds.toFixed(1)}s (${((results.length + errors.length) / seconds).toFixed(1)} battles/s)`,
);
console.log(`Errors: ${errors.length}`);
for (const e of errors)
  console.log(`  #${e.index}: ${e.message} (rerun: --seed ${seed} --only ${e.index})`);
process.exit(errors.length ? 1 : 0);
