// Checks generator output over many keys (DESIGN.md §13 M3: 10,000 seeds).
//   pnpm --filter @daily-battle/gen check [--format gen4ou] [--n 10000]
// Exits non-zero on any constraint failure or illegal team.
import { DEFAULT_FORMAT, setsFor } from '@daily-battle/data';
import { addDays } from '../src/dates';
import { generateOpponent } from '../src/opponent';
import { generatePool } from '../src/pool';
import { majorOffensiveTypes } from '../src/traits';
import { verifyOpponent, verifyPool } from '../src/verify';

const i = process.argv.indexOf('--n');
const n = i > 0 ? Number(process.argv[i + 1]) : 10_000;
const f = process.argv.indexOf('--format');
const sets = setsFor(f > 0 ? process.argv[f + 1]! : DEFAULT_FORMAT);
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
const hasMove = (species: string, moves: string[]) =>
  sets.species[species]!.sets.some((s) => s.moves.some((m) => moves.includes(m)));
let withSpikes = 0;
let withRemover = 0;
const belowOuCounts = new Map<number, number>();
for (let k = 0; k < n; k++) {
  const pool = generatePool(addDays(START, 7 * k), sets);
  poolAttempts.push(pool.attempts);
  for (const s of pool.species) poolCounts.set(s, (poolCounts.get(s) ?? 0) + 1);
  if (pool.species.some((s) => hasMove(s, ['Spikes', 'Toxic Spikes']))) withSpikes++;
  if (pool.species.some((s) => hasMove(s, ['Rapid Spin', 'Defog']))) withRemover++;
  const below = pool.species.filter((s) => !['OU', '(OU)'].includes(sets.species[s]!.tier)).length;
  belowOuCounts.set(below, (belowOuCounts.get(below) ?? 0) + 1);
  const problems = verifyPool(pool, sets, majorTypes);
  if (problems.length) failures.push(`pool ${pool.week}: ${problems.join(', ')}`);
}

const oppAttempts: number[] = [];
const oppCounts = new Map<string, number>();
const styles = new Map<string, number>();
for (let k = 0; k < n; k++) {
  const opponent = generateOpponent(addDays(START, k), sets);
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
const pct = (c: number) => `${((100 * c) / n).toFixed(1)}%`;
console.log(`  with Spikes/Toxic Spikes: ${pct(withSpikes)}, with a remover: ${pct(withRemover)}`);
console.log(
  `  below-OU species per pool: ${[...belowOuCounts]
    .sort((a, b) => a[0] - b[0])
    .map(([k, c]) => `${k}: ${pct(c)}`)
    .join(', ')}`,
);
const belowOuByUsage = Object.entries(sets.species)
  .filter(([, e]) => !['OU', '(OU)'].includes(e.tier))
  .sort((a, b) => b[1].usage - a[1].usage);
const usageLine = ([s, e]: (typeof belowOuByUsage)[number]) =>
  `${s} (${(e.usage * 100).toFixed(2)}% usage) ${pct(poolCounts.get(s) ?? 0)}`;
console.log('  below-OU species, by OU usage → share of pools containing it:');
console.log(`    most used: ${belowOuByUsage.slice(0, 5).map(usageLine).join(', ')}`);
console.log(`    least used: ${belowOuByUsage.slice(-4).map(usageLine).join(', ')}`);
summarize('Opponents', oppAttempts, oppCounts, n);
const belowOuSlots = [...oppCounts]
  .filter(([s]) => !['OU', '(OU)'].includes(sets.species[s]!.tier))
  .reduce((a, [, c]) => a + c, 0);
console.log(`  below-OU share of opponent slots: ${((100 * belowOuSlots) / (6 * n)).toFixed(1)}%`);
console.log(
  `  styles: ${[...styles].map(([s, c]) => `${s} ${((100 * c) / n).toFixed(1)}%`).join(', ')}`,
);
console.log(`Failures: ${failures.length}`);
for (const f of failures.slice(0, 20)) console.log(`  ${f}`);
process.exit(failures.length ? 1 : 0);
