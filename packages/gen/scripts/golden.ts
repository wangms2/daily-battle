// Regenerates src/__fixtures__/golden.json. Only do this on purpose: if past
// output changed, bump GENERATOR_VERSION first.
//   pnpm --filter @daily-battle/gen golden
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GENERATOR_VERSION } from '../src/config';
import { GOLDEN_WEEKS } from '../src/__fixtures__/golden-weeks';
import { generateWeek } from '../src/week';

const weeks = Object.fromEntries(GOLDEN_WEEKS.map((w) => [w, generateWeek(w)]));
const path = fileURLToPath(new URL('../src/__fixtures__/golden.json', import.meta.url));
writeFileSync(path, `${JSON.stringify({ generatorVersion: GENERATOR_VERSION, weeks }, null, 2)}\n`);
console.log(`Wrote ${GOLDEN_WEEKS.length} weeks to ${path}`);
