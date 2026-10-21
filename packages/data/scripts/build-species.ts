// Builds gen4ou/species.json (types, base stats, tier, type chart) for the web client.
//   pnpm --filter @daily-battle/data build-species
import { readFileSync, writeFileSync } from 'node:fs';
import { buildSpecies } from '../src/species';
import type { SetsFile } from '../src/types';
import { OUTPUT, SPECIES } from './paths';

const sets = JSON.parse(readFileSync(OUTPUT, 'utf8')) as SetsFile;
const file = buildSpecies(sets);
writeFileSync(SPECIES, `${JSON.stringify(file, null, 2)}\n`);
console.log(
  `Wrote ${Object.keys(file.species).length} species and ${Object.keys(file.typeChart).length} types.`,
);
