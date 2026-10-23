import { fileURLToPath } from 'node:url';
import { DEFAULT_FORMAT, formatInfo, type FormatId } from '../src/formats';

const root = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));

/** The format a script works on: `--format <id>`, else Gen 4 OU. */
function formatArg(): FormatId {
  const i = process.argv.indexOf('--format');
  const id = i > 0 ? process.argv[i + 1]! : DEFAULT_FORMAT;
  formatInfo(id); // throws on an unknown format
  return id as FormatId;
}

export const FORMAT_ID = formatArg();
export const FORMAT = formatInfo(FORMAT_ID);

export const SOURCES = {
  sets: root(`sources/${FORMAT.id}-sets.json`),
  uuSets: root(`sources/${FORMAT.uu}-sets.json`),
  stats: root(`sources/${FORMAT.id}-stats.json`),
  meta: root(`sources/${FORMAT.id}-sources.json`),
};
export const OUTPUT = root(`${FORMAT.id}/sets.json`);
export const OVERRIDES = root(`${FORMAT.id}/role-overrides.json`);
export const CURATION = root(`${FORMAT.id}/set-curation.json`);
export const SPECIES = root(`${FORMAT.id}/species.json`);
