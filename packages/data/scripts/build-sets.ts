// Builds <format>/sets.json from the snapshots in sources/.
//   pnpm --filter @daily-battle/data build-sets [--format gen4ou]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { buildSets, type SetCuration } from '../src/build';
import type { ChaosStats, CuratedSets, RoleOverrides, SourcesMeta } from '../src/types';
import { CURATION, FORMAT_ID, OUTPUT, OVERRIDES, SOURCES } from './paths';

const readJson = <T>(path: string) => JSON.parse(readFileSync(path, 'utf8')) as T;

const { file, dropped } = buildSets({
  format: FORMAT_ID,
  curated: readJson<CuratedSets>(SOURCES.sets),
  curatedUU: readJson<CuratedSets>(SOURCES.uuSets),
  stats: readJson<ChaosStats>(SOURCES.stats),
  sources: readJson<SourcesMeta>(SOURCES.meta),
  overrides: existsSync(OVERRIDES) ? readJson<RoleOverrides>(OVERRIDES) : {},
  curation: existsSync(CURATION) ? readJson<SetCuration>(CURATION) : {},
});
writeFileSync(OUTPUT, `${JSON.stringify(file, null, 2)}\n`);

const species = Object.values(file.species);
const histogram = [1, 2, 3, 4].map(
  (n) => `${n}: ${species.filter((s) => s.sets.length === n).length}`,
);
console.log(
  `Wrote ${species.length} species, ${species.reduce((a, s) => a + s.sets.length, 0)} sets.`,
);
console.log(`Sets per species: ${histogram.join(', ')}`);
console.log(`Dropped ${dropped.length} sets:`);
for (const d of dropped) console.log(`  ${d.species} / ${d.set}: ${d.reason}`);
