// Checks generator output over many keys (DESIGN.md §13 M3: 10,000 seeds).
//   pnpm --filter @daily-battle/gen check [--n 10000]
// Exits non-zero on any constraint failure or illegal team.
import { sets } from '@daily-battle/data';
import { addDays } from '../src/dates';
import { generateOpponent } from '../src/opponent';
import { generatePool } from '../src/pool';
import { majorOffensiveTypes } from '../src/traits';
import { verifyOpponent, verifyPool } from '../src/verify';

const i = process.argv.indexOf('--n');
const n = i > 0 ? Number(process.argv[i + 1]) : 10_000;
const START = '2026-01-05'; // a Monday
const majorTypes = majorOffensiveTypes(sets);

function summarize(label: string, attempts: number[], counts: Map<string, number>, slots: number) {
  const avg = attempts.reduce((a, b) => a + b, 0) / attempts.length;
  const ranked = [...counts].sort((a, b) => b[1] - a[1]);
  const pct = ([name, c]: [string, number]) => `${name} ${((100 * c) / slots).toFixed(1)}%`;
  console.log(`${label}: attempts avg ${avg.toFixed(2)}, max ${Math.max(...attempts)}`);
  console.log(`  species seen: ${counts.size} of ${Object.keys(sets.species).length}`);
  console.log(
    `  most common (share of pools/teams containing it): ${ranked.slice(0, 5).map(pct).join(', ')}`,
  );
  console.log(`  least common: ${ranked.slice(-3).map(pct).join(', ')}`);
}

const t0 = performance.now();
const failures: string[] = [];

const poolAttempts: number[] = [];
const poolCounts = new Map<string, number>();
for (let k = 0; k < n; k++) {
  const pool = generatePool(addDays(START, 7 * k));
  poolAttempts.push(pool.attempts);
  for (const s of pool.species) poolCounts.set(s, (poolCounts.get(s) ?? 0) + 1);
  const problems = verifyPool(pool, sets, majorTypes);
  if (problems.length) failures.push(`pool ${pool.week}: ${problems.join(', ')}`);
}

const oppAttempts: number[] = [];
const oppCounts = new Map<string, number>();
const styles = new Map<string, number>();
for (let k = 0; k < n; k++) {
  const opponent = generateOpponent(addDays(START, k));
  oppAttempts.push(opponent.attempts);
  styles.set(opponent.style, (styles.get(opponent.style) ?? 0) + 1);
  for (const slot of opponent.team)
    oppCounts.set(slot.species, (oppCounts.get(slot.species) ?? 0) + 1);
  const problems = verifyOpponent(opponent, sets);
  if (problems.length) failures.push(`opponent ${opponent.day}: ${problems.join(', ')}`);
}

console.log(
  `Checked ${n} pools and ${n} opponents in ${((performance.now() - t0) / 1000).toFixed(1)}s`,
);
console.log(`Major offensive types: ${majorTypes.join(', ')}`);
summarize('Pools', poolAttempts, poolCounts, n);
summarize('Opponents', oppAttempts, oppCounts, n);
console.log(
  `  styles: ${[...styles].map(([s, c]) => `${s} ${((100 * c) / n).toFixed(1)}%`).join(', ')}`,
);
console.log(`Failures: ${failures.length}`);
for (const f of failures.slice(0, 20)) console.log(`  ${f}`);
process.exit(failures.length ? 1 : 0);
