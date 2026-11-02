// Fetches Showdown's Random Battle sets for a generation into sources/, as a
// quality reference for the set audit and a source of fun sets. Not read by
// the build. Separate from `refresh` so it never moves the usage stats.
//   pnpm --filter @daily-battle/data fetch-randbats [--format gen4ou]
import { writeFileSync } from 'node:fs';
import { FORMAT, SOURCES } from './paths';

const url = `https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/random-battles/gen${FORMAT.gen}/sets.json`;
const res = await fetch(url);
if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
const data = (await res.json()) as Record<string, unknown>;
const out = { url, fetchedAt: new Date().toISOString(), species: data };
writeFileSync(SOURCES.randbats, `${JSON.stringify(out, null, 2)}\n`);
console.log(`Fetched ${Object.keys(data).length} Random Battle species for gen ${FORMAT.gen}.`);
