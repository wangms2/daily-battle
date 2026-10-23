// Regenerates a format's golden fixture: src/__fixtures__/golden.json for Gen 4
// OU, golden-<format>.json for others. Only do this on purpose: if past output
// changed, bump GENERATOR_VERSION first.
//   pnpm --filter @daily-battle/gen golden [--format gen4ou]
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEFAULT_FORMAT, setsFor } from '@daily-battle/data';
import { GENERATOR_VERSION } from '../src/config';
import { GOLDEN_WEEKS, goldenFile } from '../src/__fixtures__/golden-weeks';
import { generateWeek } from '../src/week';

const i = process.argv.indexOf('--format');
const format = i > 0 ? process.argv[i + 1]! : DEFAULT_FORMAT;
const data = setsFor(format);
const weeks = Object.fromEntries(GOLDEN_WEEKS.map((w) => [w, generateWeek(w, data)]));
const path = fileURLToPath(new URL(`../src/__fixtures__/${goldenFile(format)}`, import.meta.url));
writeFileSync(path, `${JSON.stringify({ generatorVersion: GENERATOR_VERSION, weeks }, null, 2)}\n`);
console.log(`Wrote ${GOLDEN_WEEKS.length} ${format} weeks to ${path}`);
