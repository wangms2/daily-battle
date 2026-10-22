import { fileURLToPath } from 'node:url';

const root = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));

export const SOURCES = {
  sets: root('sources/gen4ou-sets.json'),
  uuSets: root('sources/gen4uu-sets.json'),
  stats: root('sources/gen4ou-stats.json'),
  meta: root('sources/sources.json'),
};
export const OUTPUT = root('gen4ou/sets.json');
export const OVERRIDES = root('gen4ou/role-overrides.json');
export const CURATION = root('gen4ou/set-curation.json');
export const SPECIES = root('gen4ou/species.json');
